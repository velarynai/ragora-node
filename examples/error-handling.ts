/**
 * Example: Error handling and retries
 *
 * This example shows how to handle API errors gracefully,
 * including rate limits and authentication errors.
 */

import { RagoraClient, RagoraError } from '../src/index.js';
import type { SearchResponse } from '../src/index.js';

/**
 * Search with exponential backoff retry on transient errors.
 */
async function searchWithRetry(
  client: RagoraClient,
  collectionId: string,
  query: string,
  maxRetries = 3
): Promise<SearchResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.search({
        collectionId,
        query,
        topK: 5,
      });
    } catch (error) {
      if (!(error instanceof RagoraError)) {
        throw error;
      }

      console.log(`Attempt ${attempt + 1} failed: ${error}`);

      // Don't retry auth errors
      if (error.isAuthError) {
        console.log('Authentication error - check your API key');
        throw error;
      }

      // Check if worth retrying
      if (!error.isRetryable) {
        console.log(`Non-retryable error (status ${error.statusCode})`);
        throw error;
      }

      // Calculate backoff with jitter
      if (attempt < maxRetries - 1) {
        let waitTime: number;

        if (error.isRateLimited) {
          // Use rate limit reset time if available
          waitTime = 5000; // Default 5 seconds
          console.log(
            `Rate limited - waiting ${waitTime / 1000}s before retry`
          );
        } else {
          // Exponential backoff with jitter
          waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.log(
            `Transient error - waiting ${(waitTime / 1000).toFixed(1)}s before retry`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error('Max retries exceeded');
}

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  const collectionId =
    process.env.RAGORA_COLLECTION_ID ?? 'your-collection-id';

  // --- Basic error handling ---
  console.log('=== Basic Error Handling ===\n');

  try {
    await client.search({
      collectionId: 'non-existent-collection',
      query: 'test query',
    });
  } catch (error) {
    if (error instanceof RagoraError) {
      console.log(`Error: ${error}`);
      console.log(`Status code: ${error.statusCode}`);
      console.log(`Request ID: ${error.requestId}`);

      if (error.error) {
        console.log(`Error code: ${error.error.code}`);
        console.log(`Error message: ${error.error.message}`);
      }
    } else {
      console.log(`Unexpected error: ${error}`);
    }
  }

  // --- Retry with backoff ---
  console.log('\n\n=== Retry with Backoff ===\n');

  try {
    const results = await searchWithRetry(
      client,
      collectionId,
      'What is machine learning?',
      3
    );
    console.log(`Success! Found ${results.total} results`);
  } catch (error) {
    if (error instanceof RagoraError) {
      console.log(`All retries failed: ${error}`);
    } else {
      console.log(`Unexpected error: ${error}`);
    }
  }
}

main().catch(console.error);
