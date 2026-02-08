/**
 * Example: Search documents in a collection
 *
 * This example shows how to search for relevant documents
 * and access response metadata.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  // Initialize client
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  const collectionId =
    process.env.RAGORA_COLLECTION_ID ?? 'your-collection-id';

  // Search for documents
  const results = await client.search({
    collectionId,
    query: 'What is retrieval augmented generation?',
    topK: 5,
    threshold: 0.7, // Only return results with score >= 0.7
  });

  // Print results
  console.log(`Found ${results.total} results\n`);

  results.results.forEach((result, i) => {
    console.log(`--- Result ${i + 1} (score: ${result.score.toFixed(3)}) ---`);
    console.log(
      result.content.length > 200
        ? result.content.slice(0, 200) + '...'
        : result.content
    );
    console.log();
  });

  // Access metadata from response headers
  console.log('--- Response Metadata ---');
  console.log(`Request ID: ${results.requestId}`);
  console.log(`API Version: ${results.apiVersion}`);
  console.log(
    `Cost: ${results.costUsd ? `$${results.costUsd.toFixed(6)}` : 'N/A'}`
  );
  console.log(
    `Balance Remaining: ${
      results.balanceRemainingUsd
        ? `$${results.balanceRemainingUsd.toFixed(2)}`
        : 'N/A'
    }`
  );
  console.log(
    `Rate Limit Remaining: ${results.rateLimitRemaining}/${results.rateLimitLimit}`
  );
}

main().catch(console.error);
