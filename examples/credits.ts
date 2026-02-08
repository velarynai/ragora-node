/**
 * Example: Credit balance and cost tracking
 *
 * This example shows how to check your credit balance and
 * track costs from API responses.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  // --- Check credit balance ---
  console.log('=== Credit Balance ===\n');

  const balance = await client.getBalance();

  console.log(`Balance: $${balance.balanceUsd.toFixed(2)} ${balance.currency}`);
  console.log(`Request ID: ${balance.requestId}\n`);

  // --- Perform a search and track costs ---
  const collectionId =
    process.env.RAGORA_COLLECTION_ID ?? 'your-collection-id';

  console.log('=== Search with Cost Tracking ===\n');

  const results = await client.search({
    collectionId,
    query: 'How does vector search work?',
    topK: 3,
  });

  console.log(`Found ${results.total} results`);
  console.log(
    `Cost: ${results.costUsd ? `$${results.costUsd.toFixed(6)}` : 'N/A'}`
  );
  console.log(
    `Balance remaining: ${
      results.balanceRemainingUsd
        ? `$${results.balanceRemainingUsd.toFixed(2)}`
        : 'N/A'
    }`
  );

  // --- Rate limit info ---
  console.log('\n=== Rate Limit Info ===\n');

  console.log(`Limit: ${results.rateLimitLimit ?? 'N/A'} requests per window`);
  console.log(`Remaining: ${results.rateLimitRemaining ?? 'N/A'}`);
  console.log(
    `Resets in: ${
      results.rateLimitReset ? `${results.rateLimitReset} seconds` : 'N/A'
    }`
  );
}

main().catch(console.error);
