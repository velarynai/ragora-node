import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagoraClient } from '../src/client.js';

describe('uploadDocument FormData construction', () => {
  let appendSpy: ReturnType<typeof vi.fn>;
  let client: RagoraClient;

  beforeEach(() => {
    appendSpy = vi.fn();

    // Mock FormData to capture appended fields
    vi.stubGlobal(
      'FormData',
      class {
        append = appendSpy;
      }
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 'doc-1',
        file_name: 'test.pdf',
        status: 'pending',
        collection_id: 'coll-1',
      }),
    });

    client = new RagoraClient({
      apiKey: 'test-key',
      maxRetries: 0,
    });
    // @ts-expect-error Overriding private field for testing
    client.fetchFn = mockFetch;
  });

  it('sends only file and collection_id when no metadata provided', async () => {
    await client.uploadDocument({
      file: new Blob(['test']),
      filename: 'test.pdf',
      collectionId: 'coll-1',
    });

    const keys = appendSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(keys).toContain('file');
    expect(keys).toContain('collection_id');
    expect(keys).not.toContain('relative_path');
    expect(keys).not.toContain('release_tag');
  });

  it('sends all metadata fields when provided', async () => {
    await client.uploadDocument({
      file: new Blob(['test']),
      filename: 'test.pdf',
      collectionId: 'coll-1',
      relativePath: 'docs/legal/',
      releaseTag: 'v2.0',
      version: '2.0.0',
      effectiveAt: '2024-06-01T00:00:00Z',
      documentTime: '2024-06-01T12:00:00Z',
      expiresAt: '2025-06-01T00:00:00Z',
      sourceType: 'sec_filing',
      sourceName: 'sec-edgar',
      customTags: ['10-K', 'annual'],
      domain: 'financial',
      scanMode: 'hi_res',
    });

    const calls = appendSpy.mock.calls;
    const fieldMap = new Map(calls.map((c: unknown[]) => [c[0], c[1]]));

    expect(fieldMap.get('relative_path')).toBe('docs/legal/');
    expect(fieldMap.get('release_tag')).toBe('v2.0');
    expect(fieldMap.get('version')).toBe('2.0.0');
    expect(fieldMap.get('effective_at')).toBe('2024-06-01T00:00:00Z');
    expect(fieldMap.get('document_time')).toBe('2024-06-01T12:00:00Z');
    expect(fieldMap.get('expires_at')).toBe('2025-06-01T00:00:00Z');
    expect(fieldMap.get('source_type')).toBe('sec_filing');
    expect(fieldMap.get('source_name')).toBe('sec-edgar');
    expect(fieldMap.get('custom_tags')).toBe(JSON.stringify(['10-K', 'annual']));
    expect(fieldMap.get('domain')).toBe('financial');
    expect(fieldMap.get('scan_mode')).toBe('hi_res');
  });

  it('JSON-encodes customTags in FormData', async () => {
    await client.uploadDocument({
      file: new Blob(['data']),
      filename: 'doc.txt',
      collectionId: 'coll-1',
      customTags: ['alpha', 'beta'],
    });

    const tagsCall = appendSpy.mock.calls.find((c: unknown[]) => c[0] === 'custom_tags');
    expect(tagsCall).toBeDefined();
    expect(JSON.parse(tagsCall![1] as string)).toEqual(['alpha', 'beta']);
  });
});

describe('uploadFile convenience method', () => {
  it('is defined on RagoraClient', () => {
    const client = new RagoraClient({ apiKey: 'test-key' });
    expect(typeof client.uploadFile).toBe('function');
  });
});
