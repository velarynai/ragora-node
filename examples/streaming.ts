/**
 * Example: Streaming chat completion
 *
 * This example shows how to stream chat responses
 * using async iterators.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  const collectionId =
    process.env.RAGORA_COLLECTION_ID ?? 'your-collection-id';

  // Streaming chat
  console.log('=== Streaming Chat ===\n');

  process.stdout.write('Assistant: ');

  let sources: typeof chunk.sources = [];

  for await (const chunk of client.chatStream({
    collectionId,
    messages: [
      {
        role: 'user',
        content: 'Explain the benefits of using RAG over fine-tuning',
      },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.7,
  })) {
    process.stdout.write(chunk.content);

    // Sources are included in the final chunk
    if (chunk.sources.length > 0) {
      sources = chunk.sources;
    }
  }

  console.log('\n');

  if (sources.length > 0) {
    console.log(`--- Sources (${sources.length}) ---`);
    sources.forEach((source) => {
      console.log(`  - ${source.content.slice(0, 100)}...`);
    });
  }
}

main().catch(console.error);
