/**
 * Example: Document upload and management
 *
 * This example demonstrates uploading a document, waiting for
 * processing, checking status, listing documents, and cleanup.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  // --- Create a collection for our documents ---
  console.log('=== Setup: Create Collection ===\n');

  const collection = await client.createCollection({
    name: 'Document Example Collection',
    description: 'Temporary collection for document upload demo',
  });

  console.log(`Created collection: ${collection.name} (${collection.id})\n`);

  // --- Upload a text document ---
  console.log('=== Upload Document ===\n');

  const content = Buffer.from(
    'Retrieval Augmented Generation (RAG) is a technique that combines ' +
    'information retrieval with text generation. It retrieves relevant ' +
    'documents from a knowledge base and uses them as context for an LLM ' +
    'to generate accurate, grounded responses. This approach reduces ' +
    'hallucinations and keeps answers up to date with the latest information.'
  );

  const upload = await client.uploadDocument({
    file: new Blob([content], { type: 'text/plain' }),
    filename: 'rag-overview.txt',
    collectionId: collection.id,
  });

  console.log(`Uploaded: ${upload.filename}`);
  console.log(`  Document ID: ${upload.id}`);
  console.log(`  Status: ${upload.status}`);
  console.log(`  Message: ${upload.message}\n`);

  // --- Wait for processing to complete ---
  console.log('=== Wait for Processing ===\n');

  const status = await client.waitForDocument(upload.id, {
    timeout: 120000,     // 2 minutes max
    pollInterval: 3000,  // check every 3 seconds
  });

  console.log(`Processing complete: ${status.filename}`);
  console.log(`  Status: ${status.status}`);
  console.log(`  Chunks: ${status.chunkCount}`);
  console.log(`  Vectors: ${status.vectorCount}\n`);

  // --- Check document status directly ---
  console.log('=== Check Document Status ===\n');

  const docStatus = await client.getDocumentStatus(upload.id);

  console.log(`Status for ${docStatus.filename}:`);
  console.log(`  Status: ${docStatus.status}`);
  console.log(`  Progress: ${docStatus.progressPercent ?? 100}%`);
  console.log(`  Active: ${docStatus.isActive}`);
  console.log(`  Version: ${docStatus.versionNumber}\n`);

  // --- List documents in the collection ---
  console.log('=== List Documents ===\n');

  const docs = await client.listDocuments({
    collectionId: collection.id,
    limit: 10,
  });

  console.log(`Found ${docs.total} document(s):\n`);

  docs.data.forEach((doc) => {
    console.log(`  - ${doc.filename} (${doc.status})`);
    console.log(`    ID: ${doc.id}`);
    console.log(`    Chunks: ${doc.chunkCount}, Vectors: ${doc.vectorCount}`);
  });
  console.log();

  // --- Clean up ---
  console.log('=== Cleanup ===\n');

  const deletedDoc = await client.deleteDocument(upload.id);
  console.log(`Deleted document: ${deletedDoc.message}`);

  const deletedColl = await client.deleteCollection(collection.id);
  console.log(`Deleted collection: ${deletedColl.message}`);
}

main().catch(console.error);
