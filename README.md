# Ragora Node.js SDK

Official Node.js/TypeScript SDK for the [Ragora](https://ragora.app) RAG API. Build AI-powered knowledge bases with semantic search and chat completions.

[![npm version](https://badge.fury.io/js/ragora.svg)](https://www.npmjs.com/package/ragora)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install ragora
```

Or with other package managers:

```bash
pnpm add ragora
yarn add ragora
```

## Quick Start

```typescript
import { RagoraClient } from 'ragora';

const client = new RagoraClient({ apiKey: 'your-api-key' });

// Create a collection
const collection = await client.createCollection({
  name: 'My Knowledge Base',
  description: 'Documentation and guides',
});
console.log(`Created collection: ${collection.id}`);

// Upload a document
const upload = await client.uploadDocument({
  file: new Blob(['Hello world']),
  filename: 'hello.txt',
  collectionId: collection.id,
});
console.log(`Uploaded: ${upload.filename} (ID: ${upload.id})`);

// Wait for processing to complete
const status = await client.waitForDocument(upload.id);
console.log(`Processing complete: ${status.vectorCount} vectors created`);

// Search the collection
const results = await client.search({
  collectionId: collection.id,
  query: 'How do I get started?',
  topK: 5,
});
results.results.forEach((result) => {
  console.log(`Score: ${result.score.toFixed(3)} - ${result.content.slice(0, 100)}...`);
});

// Chat with your knowledge base
const response = await client.chat({
  collectionId: collection.id,
  messages: [{ role: 'user', content: 'Summarize the main concepts' }],
});
console.log(response.choices[0].message.content);
```

## Features

- **Fetch-based** - Works in Node.js, browsers, and edge runtimes
- **Full TypeScript** - Complete type definitions included
- **Streaming support** - Real-time chat completions with async iterators
- **Document management** - Upload, track progress, and manage documents
- **Collection CRUD** - Create, update, delete, and list collections
- **Cost tracking** - Monitor API costs per request
- **Next.js ready** - Works with App Router and Pages Router

## API Reference

### Client Initialization

```typescript
import { RagoraClient } from 'ragora';

// Basic usage
const client = new RagoraClient({ apiKey: 'your-api-key' });

// With custom settings
const client = new RagoraClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.ragora.app', // default
  timeout: 30000, // milliseconds
  fetch: customFetch, // optional custom fetch implementation
});
```

### Collections

```typescript
// Create a collection
const collection = await client.createCollection({
  name: 'My Collection',
  description: 'Optional description',
  slug: 'my-collection', // optional, auto-generated if not provided
});

// List collections
const collections = await client.listCollections({ limit: 20, offset: 0 });
for (const coll of collections.data) {
  console.log(`${coll.name}: ${coll.totalDocuments} documents`);
}

// Get a collection by ID or slug
const collection = await client.getCollection('collection-id-or-slug');

// Update a collection
const updated = await client.updateCollection('collection-id', {
  name: 'New Name',
  description: 'Updated description',
});

// Delete a collection
const result = await client.deleteCollection('collection-id');
console.log(result.message);
```

### Documents

```typescript
// Upload a document (Node.js with Buffer)
import { readFileSync } from 'fs';

const upload = await client.uploadDocument({
  file: readFileSync('./document.pdf'),
  filename: 'document.pdf',
  collectionId: 'collection-id', // optional, uses default if not provided
});

// Upload a document (Browser with Blob/File)
const upload = await client.uploadDocument({
  file: fileInput.files[0], // from <input type="file">
  filename: fileInput.files[0].name,
  collectionId: 'collection-id',
});

// Check document status
const status = await client.getDocumentStatus(upload.id);
console.log(`Status: ${status.status}`);
console.log(`Progress: ${status.progressPercent}%`);
console.log(`Stage: ${status.progressStage}`);

// Wait for processing to complete
const status = await client.waitForDocument(upload.id, {
  timeout: 300000, // max wait time in ms (default: 5 minutes)
  pollInterval: 2000, // time between status checks in ms
});

// List documents in a collection
const documents = await client.listDocuments({
  collectionId: 'collection-id',
  limit: 50,
  offset: 0,
});

// Delete a document
const result = await client.deleteDocument('document-id');
```

### Search

```typescript
const results = await client.search({
  collectionId: 'collection-id',
  query: 'What is machine learning?',
  topK: 5, // number of results
  threshold: 0.7, // minimum relevance score (0-1)
  filter: { type: 'doc' }, // optional metadata filter
});

for (const result of results.results) {
  console.log(`Score: ${result.score.toFixed(3)}`);
  console.log(`Content: ${result.content}`);
  console.log(`Document ID: ${result.documentId}`);
  console.log('---');
}
```

### Chat Completions

```typescript
// Non-streaming
const response = await client.chat({
  collectionId: 'collection-id',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain RAG' },
  ],
  model: 'gpt-4o-mini', // optional
  temperature: 0.7, // optional
  maxTokens: 1000, // optional
  systemPrompt: 'Custom system prompt', // optional
});

console.log(response.choices[0].message.content);
console.log(`Sources used: ${response.sources.length}`);

// Streaming
for await (const chunk of client.chatStream({
  collectionId: 'collection-id',
  messages: [{ role: 'user', content: 'Explain RAG' }],
})) {
  process.stdout.write(chunk.content);

  // Sources are included in the final chunk
  if (chunk.sources.length > 0) {
    console.log(`\n\nSources: ${chunk.sources.length}`);
  }
}
```

### Marketplace

```typescript
// Browse marketplace products
const products = await client.listMarketplace({ limit: 10, search: 'AI' });
for (const product of products.data) {
  console.log(`${product.title} - ${product.averageRating.toFixed(1)} stars`);
}

// Get product details (by ID or slug)
const product = await client.getMarketplaceProduct('product-slug');
console.log(`${product.title}: ${product.totalVectors} vectors`);
if (product.listings) {
  for (const listing of product.listings) {
    console.log(`  ${listing.type}: $${listing.priceAmountUsd}`);
  }
}
```

### Credits

```typescript
const balance = await client.getBalance();
console.log(`Balance: $${balance.balanceUsd.toFixed(2)} ${balance.currency}`);
```

## Response Metadata

Every response includes metadata from API headers:

```typescript
const response = await client.search({...});

console.log(`Request ID: ${response.requestId}`);
console.log(`API Version: ${response.apiVersion}`);
console.log(`Cost: $${response.costUsd?.toFixed(4)}`);
console.log(`Remaining balance: $${response.balanceRemainingUsd?.toFixed(2)}`);
console.log(`Rate limit: ${response.rateLimitRemaining}/${response.rateLimitLimit}`);
console.log(`Rate limit resets in: ${response.rateLimitReset}s`);
```

## Error Handling

```typescript
import { RagoraClient, RagoraError } from 'ragora';

const client = new RagoraClient({ apiKey: 'your-api-key' });

try {
  const results = await client.search({...});
} catch (error) {
  if (error instanceof RagoraError) {
    console.log(`Error: ${error.message}`);
    console.log(`Status code: ${error.statusCode}`);
    console.log(`Request ID: ${error.requestId}`);

    if (error.isRateLimited) {
      console.log('Rate limited - wait and retry');
    } else if (error.isAuthError) {
      console.log('Check your API key');
    } else if (error.isRetryable) {
      console.log('Temporary error - safe to retry');
    }
  }
}
```

## Next.js Integration

### App Router (Server Components)

```typescript
// app/api/search/route.ts
import { RagoraClient } from 'ragora';
import { NextResponse } from 'next/server';

const client = new RagoraClient({
  apiKey: process.env.RAGORA_API_KEY!,
});

export async function POST(request: Request) {
  const { query, collectionId } = await request.json();

  const results = await client.search({
    collectionId,
    query,
    topK: 5,
  });

  return NextResponse.json(results);
}
```

### Streaming Chat (App Router)

```typescript
// app/api/chat/route.ts
import { RagoraClient } from 'ragora';

const client = new RagoraClient({
  apiKey: process.env.RAGORA_API_KEY!,
});

export async function POST(request: Request) {
  const { messages, collectionId } = await request.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of client.chatStream({
        collectionId,
        messages,
      })) {
        controller.enqueue(encoder.encode(chunk.content));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

### Pages Router

```typescript
// pages/api/chat.ts
import { RagoraClient } from 'ragora';
import type { NextApiRequest, NextApiResponse } from 'next';

const client = new RagoraClient({
  apiKey: process.env.RAGORA_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { messages, collectionId } = req.body;

  const response = await client.chat({
    collectionId,
    messages,
  });

  res.status(200).json(response);
}
```

## Examples

See the [`examples/`](examples/) directory for complete, runnable examples:

| Example | Description | Command |
|---------|-------------|---------|
| [Search](examples/search.ts) | Search documents and access response metadata | `npm run example:search` |
| [Chat](examples/chat.ts) | Chat completions with RAG context | `npm run example:chat` |
| [Streaming](examples/streaming.ts) | Streaming chat responses | `npm run example:streaming` |
| [Collections CRUD](examples/collections-crud.ts) | Create, list, get, update, delete collections | `npm run example:collections` |
| [Documents](examples/documents.ts) | Upload, process, list, delete documents | `npm run example:documents` |
| [Marketplace](examples/marketplace.ts) | Browse marketplace products and listings | `npm run example:marketplace` |
| [Credits](examples/credits.ts) | Check balance and track costs | `npm run example:credits` |

Set your API key before running:

```bash
export RAGORA_API_KEY="your-api-key"
npm run example:search
```

### Quick Smoke Test (Before Publishing)

Run a fast pre-publish validation:

```bash
npm run smoke
```

This runs:
- Type checking
- Build
- `npm pack --dry-run`
- Example checks (`example:search`, `example:chat`, `example:streaming`,
  `example:credits`, `example:documents`, `example:collections`,
  `example:marketplace`) when both env vars are set:

```bash
export RAGORA_API_KEY="your-api-key"
export RAGORA_COLLECTION_ID="your-collection-id"
npm run smoke
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Ragora Website](https://ragora.app)
- [API Documentation](https://docs.ragora.app)
- [GitHub Repository](https://github.com/velarynai/ragora-node)
