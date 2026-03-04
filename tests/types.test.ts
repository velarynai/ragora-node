import { describe, it, expectTypeOf } from 'vitest';
import type {
  SearchRequest,
  UploadDocumentRequest,
  ThinkingStep,
  ChatStreamChunk,
  AgentChatStreamChunk,
  Collection,
  MarketplaceProduct,
} from '../src/types.js';

describe('SearchRequest type', () => {
  it('does not include threshold', () => {
    const req: SearchRequest = { query: 'test' };
    // @ts-expect-error threshold should not exist
    expectTypeOf<SearchRequest>().not.toHaveProperty('threshold');
  });
});

describe('UploadDocumentRequest type', () => {
  it('includes all metadata fields', () => {
    const req: UploadDocumentRequest = {
      file: new Blob(['test']),
      filename: 'test.txt',
      collection: 'my-collection',
      relativePath: 'docs/',
      releaseTag: 'v1.0',
      version: '1.0.0',
      effectiveAt: '2024-01-01T00:00:00Z',
      documentTime: '2024-01-01T00:00:00Z',
      expiresAt: '2025-01-01T00:00:00Z',
      sourceType: 'web_crawl',
      sourceName: 'my-source',
      customTags: ['tag1', 'tag2'],
      domain: 'legal',
      scanMode: 'hi_res',
    };

    expectTypeOf(req.relativePath).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.releaseTag).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.customTags).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(req.scanMode).toEqualTypeOf<string | undefined>();
  });
});

describe('ThinkingStep type', () => {
  it('has correct shape', () => {
    const step: ThinkingStep = {
      type: 'thinking',
      message: 'Processing query...',
      timestamp: Date.now(),
    };
    expectTypeOf(step.type).toBeString();
    expectTypeOf(step.message).toBeString();
    expectTypeOf(step.timestamp).toBeNumber();
  });
});

describe('ChatStreamChunk type', () => {
  it('uses ThinkingStep for thinking field', () => {
    const chunk: ChatStreamChunk = {
      content: 'hello',
      sources: [],
      thinking: { type: 'searching', message: 'Looking up...', timestamp: 123 },
    };
    expectTypeOf(chunk.thinking).toEqualTypeOf<ThinkingStep | undefined>();
  });
});

describe('AgentChatStreamChunk type', () => {
  it('uses ThinkingStep for thinking field', () => {
    const chunk: AgentChatStreamChunk = {
      content: '',
      sources: [],
      done: false,
      thinking: { type: 'working', message: 'Processing...', timestamp: 0 },
    };
    expectTypeOf(chunk.thinking).toEqualTypeOf<ThinkingStep | undefined>();
  });
});

describe('Collection type', () => {
  it('has ownerId field', () => {
    const coll: Collection = {
      id: '123',
      ownerId: 'user-1',
      name: 'Test',
      totalDocuments: 0,
      totalVectors: 0,
      totalChunks: 0,
      totalSizeBytes: 0,
    };
    expectTypeOf(coll.ownerId).toEqualTypeOf<string | undefined>();
  });
});

describe('MarketplaceProduct type', () => {
  it('has thumbnailUrl, dataSize, isTrending, isVerified', () => {
    const product: MarketplaceProduct = {
      id: 'prod-1',
      sellerId: 'seller-1',
      slug: 'test',
      title: 'Test Product',
      status: 'active',
      averageRating: 4.5,
      reviewCount: 10,
      totalVectors: 100,
      totalChunks: 50,
      accessCount: 5,
      thumbnailUrl: 'https://example.com/thumb.png',
      dataSize: '1.5 GB',
      isTrending: true,
      isVerified: false,
    };
    expectTypeOf(product.thumbnailUrl).toEqualTypeOf<string | undefined>();
    expectTypeOf(product.dataSize).toEqualTypeOf<string | undefined>();
    expectTypeOf(product.isTrending).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(product.isVerified).toEqualTypeOf<boolean | undefined>();
  });
});
