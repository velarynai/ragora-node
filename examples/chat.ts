/**
 * Example: Chat completion with RAG context
 *
 * This example shows how to use the chat API with
 * non-streaming responses.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  const collectionId =
    process.env.RAGORA_COLLECTION_ID ?? 'your-collection-id';

  // Non-streaming chat
  console.log('=== Chat Completion ===\n');

  const response = await client.chat({
    collectionId,
    messages: [{ role: 'user', content: 'What is RAG and how does it work?' }],
    model: 'gpt-4o-mini',
    temperature: 0.7,
  });

  console.log(`Assistant: ${response.choices[0].message.content}\n`);

  if (response.sources.length > 0) {
    console.log(`--- Sources (${response.sources.length}) ---`);
    response.sources.forEach((source) => {
      console.log(
        `  - ${source.content.slice(0, 100)}... (score: ${source.score.toFixed(3)})`
      );
    });
    console.log();
  }

  console.log(`Usage:`, response.usage);
  console.log(`Request ID: ${response.requestId}`);
  console.log(
    `Cost: ${response.costUsd ? `$${response.costUsd.toFixed(6)}` : 'N/A'}`
  );
}

main().catch(console.error);
