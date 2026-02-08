/**
 * Example: Collection CRUD operations
 *
 * This example demonstrates the full lifecycle of collections:
 * creating, listing, retrieving, updating, and deleting.
 */

import { RagoraClient } from '../src/index.js';
import type { Collection } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  // --- Create a collection ---
  console.log('=== Create Collection ===\n');

  const collection = await client.createCollection({
    name: 'SDK Example Collection',
    description: 'A test collection created from the JavaScript SDK',
  });

  console.log(`Created collection: ${collection.name}`);
  console.log(`  ID: ${collection.id}`);
  console.log(`  Description: ${collection.description}`);
  console.log(`  Created at: ${collection.createdAt}\n`);

  // --- List collections (with pagination) ---
  console.log('=== List Collections ===\n');

  const list = await client.listCollections({ limit: 10, offset: 0 });

  console.log(`Total collections: ${list.total}`);
  console.log(`Page size: ${list.limit}, offset: ${list.offset}, hasMore: ${list.hasMore}\n`);

  list.data.forEach((c: Collection) => {
    console.log(`  - ${c.name} (${c.id})`);
  });
  console.log();

  // --- Get collection by ID ---
  console.log('=== Get Collection ===\n');

  const fetched = await client.getCollection(collection.id);

  console.log(`Fetched: ${fetched.name}`);
  console.log(`  ID: ${fetched.id}`);
  console.log(`  Description: ${fetched.description}\n`);

  // --- Update collection ---
  console.log('=== Update Collection ===\n');

  const updated = await client.updateCollection(collection.id, {
    name: 'SDK Example Collection (Updated)',
    description: 'Updated description from the JavaScript SDK',
  });

  console.log(`Updated: ${updated.name}`);
  console.log(`  Description: ${updated.description}\n`);

  // --- Delete collection ---
  console.log('=== Delete Collection ===\n');

  const deleted = await client.deleteCollection(collection.id);

  console.log(`Deleted: ${deleted.message}`);
  console.log(`  ID: ${deleted.id}`);
}

main().catch(console.error);
