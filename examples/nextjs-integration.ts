/**
 * Example: Next.js App Router integration
 *
 * This shows how to use the Ragora SDK in a Next.js App Router
 * API route with streaming responses.
 */

import { RagoraClient } from '../src/index.js';

// Initialize client (in production, use environment variables)
const client = new RagoraClient({
  apiKey: process.env.RAGORA_API_KEY!,
  baseUrl: process.env.RAGORA_BASE_URL,
});

// Example: app/api/search/route.ts
export async function searchHandler(request: Request) {
  const { query, collectionId } = (await request.json()) as {
    query: string;
    collectionId: string;
  };

  const results = await client.search({
    collectionId,
    query,
    topK: 5,
  });

  return Response.json(results);
}

// Example: app/api/chat/route.ts (non-streaming)
export async function chatHandler(request: Request) {
  const { messages, collectionId } = (await request.json()) as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    collectionId: string;
  };

  const response = await client.chat({
    collectionId,
    messages,
  });

  return Response.json(response);
}

// Example: app/api/chat/stream/route.ts (streaming)
export async function streamingChatHandler(request: Request) {
  const { messages, collectionId } = (await request.json()) as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    collectionId: string;
  };

  // Create a TransformStream to convert our async generator to a ReadableStream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of client.chatStream({
          collectionId,
          messages,
        })) {
          // Send as Server-Sent Events format
          const data = JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Example client-side hook for consuming streaming responses
// This would go in your React component
/*
import { useState, useCallback } from 'react';

export function useRagoraChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string, collectionId: string) => {
    setIsStreaming(true);
    
    // Add user message
    const userMessage = { role: 'user' as const, content };
    setMessages(prev => [...prev, userMessage]);
    
    // Start with empty assistant message
    setMessages(prev => [...prev, { role: 'assistant' as const, content: '' }]);
    
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          collectionId,
        }),
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const chunk = JSON.parse(data);
            // Update the last message (assistant)
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              lastMessage.content += chunk.content;
              return newMessages;
            });
          } catch {}
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  return { messages, sendMessage, isStreaming };
}
*/

// Demo output
async function main() {
  console.log('Next.js App Router Integration Examples');
  console.log('========================================');
  console.log();
  console.log('This file contains example handlers for Next.js App Router:');
  console.log();
  console.log('1. searchHandler - POST /api/search');
  console.log('   Search documents in a collection');
  console.log();
  console.log('2. chatHandler - POST /api/chat');
  console.log('   Non-streaming chat completion');
  console.log();
  console.log('3. streamingChatHandler - POST /api/chat/stream');
  console.log('   Streaming chat with Server-Sent Events');
  console.log();
  console.log('Copy these handlers to your Next.js app/api/ directory.');
}

main().catch(console.error);
