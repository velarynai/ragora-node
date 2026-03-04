import { describe, it, expect, vi } from 'vitest';
import { RagoraClient } from '../src/client.js';

describe('response metadata extraction', () => {
  it('extracts all metadata headers from a response', async () => {
    const headers = new Headers({
      'X-Request-ID': 'req-123',
      'X-Ragora-API-Version': '2024-01-01',
      'X-Ragora-Cost-USD': '0.0015',
      'X-Ragora-Balance-Remaining-USD': '9.99',
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '95',
      'X-RateLimit-Reset': '60',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      json: async () => ({
        balance_usd: 9.99,
        currency: 'USD',
      }),
    });

    const client = new RagoraClient({
      apiKey: 'test-key',
      maxRetries: 0,
    });
    // @ts-expect-error Overriding private field for testing
    client.fetchFn = mockFetch;

    const result = await client.getBalance();

    expect(result.requestId).toBe('req-123');
    expect(result.apiVersion).toBe('2024-01-01');
    expect(result.costUsd).toBe(0.0015);
    expect(result.balanceRemainingUsd).toBe(9.99);
    expect(result.rateLimitLimit).toBe(100);
    expect(result.rateLimitRemaining).toBe(95);
    expect(result.rateLimitReset).toBe(60);
  });

  it('handles missing metadata headers gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        balance_usd: 5.0,
        currency: 'USD',
      }),
    });

    const client = new RagoraClient({
      apiKey: 'test-key',
      maxRetries: 0,
    });
    // @ts-expect-error Overriding private field for testing
    client.fetchFn = mockFetch;

    const result = await client.getBalance();

    expect(result.requestId).toBeUndefined();
    expect(result.costUsd).toBeUndefined();
    expect(result.rateLimitLimit).toBeUndefined();
  });
});

describe('search request body serialization', () => {
  it('converts camelCase options to snake_case in API body', async () => {
    let capturedBody: string | undefined;

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          results: [],
          query: 'test',
          total: 0,
        }),
      };
    });

    const client = new RagoraClient({
      apiKey: 'test-key',
      maxRetries: 0,
    });
    // @ts-expect-error Overriding private field for testing
    client.fetchFn = mockFetch;

    await client.search({
      query: 'test query',
      topK: 10,
      sourceType: ['upload'],
      versionMode: 'latest',
      customTags: ['tag1'],
      domainFilterMode: 'strict',
      enableReranker: true,
      graphFilter: {
        entities: ['Alice'],
        entityType: 'PERSON',
      },
      temporalFilter: {
        asOf: '2024-01-01',
        recencyWeight: 0.8,
        recencyDecay: 'exponential',
        decayHalfLife: 30,
      },
    });

    expect(capturedBody).toBeDefined();
    const body = JSON.parse(capturedBody!);

    expect(body.query).toBe('test query');
    expect(body.top_k).toBe(10);
    expect(body.source_type).toEqual(['upload']);
    expect(body.version_mode).toBe('latest');
    expect(body.custom_tags).toEqual(['tag1']);
    expect(body.domain_filter_mode).toBe('strict');
    expect(body.enable_reranker).toBe(true);
    expect(body.graph_filter.entities).toEqual(['Alice']);
    expect(body.graph_filter.entity_type).toBe('PERSON');
    expect(body.temporal_filter.as_of).toBe('2024-01-01');
    expect(body.temporal_filter.recency_weight).toBe(0.8);
    expect(body.temporal_filter.recency_decay).toBe('exponential');
    expect(body.temporal_filter.decay_half_life).toBe(30);

    // threshold should not be present
    expect(body.threshold).toBeUndefined();
  });
});
