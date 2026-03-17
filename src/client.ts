/**
 * Ragora API Client
 *
 * Fetch-based HTTP client for the Ragora API.
 */

import { RagoraError, AuthenticationError, AuthorizationError, NotFoundError, RateLimitError, ServerError } from './errors.js';
import type {
  Agent,
  AgentChatRequest,
  AgentChatResponse,
  AgentChatStreamChunk,
  AgentMessage,
  AgentSession,
  AgentSessionDetailResponse,
  AgentSessionListResponse,
  APIError,
  ChatChoice,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  Collection,
  CollectionListRequest,
  CollectionListResponse,
  CreateAgentRequest,
  CreateCollectionRequest,
  CreditBalance,
  DeleteResponse,
  Document,
  DocumentListRequest,
  DocumentListResponse,
  DocumentStatus,
  AgentListResponse,
  Listing,
  MarketplaceListRequest,
  MarketplaceListResponse,
  MarketplaceProduct,
  RequestOptions,
  ResponseMetadata,
  SearchRequest,
  SearchResponse,
  SearchResult,
  UpdateAgentRequest,
  UpdateCollectionRequest,
  UploadDocumentRequest,
  UploadResponse,
} from './types.js';

const SDK_VERSION = '0.2.0';

export interface RagoraClientOptions {
  /** Your Ragora API key (falls back to RAGORA_API_KEY env var) */
  apiKey?: string;
  /** API base URL (falls back to RAGORA_BASE_URL env var, default: https://api.ragora.app) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /**
   * Maximum number of retries for rate-limit (429) and server errors (5xx).
   * Set to 0 to disable automatic retries. Default: 2.
   */
  maxRetries?: number;
  /** Custom fetch implementation (for testing or environments without global fetch) */
  fetch?: typeof fetch;
  /** String appended to the default User-Agent header */
  userAgentSuffix?: string;
  /** Enable debug logging. Pass `true` to use console.debug, or a custom log function. */
  debug?: boolean | ((msg: string, ...args: unknown[]) => void);
}

export class RagoraClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent: string;
  private readonly debugLog?: (msg: string, ...args: unknown[]) => void;
  private readonly resolverCacheTtlMs: number = 5 * 60 * 1000;
  private readonly collectionRefCache = new Map<
    string,
    { resolvedId: string; expiresAt: number }
  >();
  private readonly productRefCache = new Map<
    string,
    { resolvedId: string; expiresAt: number }
  >();

  private static readonly RETRYABLE_STATUS_CODES = new Set([
    429, 500, 502, 503, 504,
  ]);

  constructor(options: RagoraClientOptions) {
    const resolvedApiKey = options.apiKey ?? process.env.RAGORA_API_KEY;
    if (!resolvedApiKey) {
      throw new Error(
        'apiKey must be provided or set via the RAGORA_API_KEY environment variable'
      );
    }
    this.apiKey = resolvedApiKey;
    this.baseUrl = (options.baseUrl ?? process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app').replace(
      /\/$/,
      ''
    );
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = `ragora-js/${SDK_VERSION}${options.userAgentSuffix ? ` ${options.userAgentSuffix}` : ''}`;
    if (options.debug) {
      this.debugLog = typeof options.debug === 'function'
        ? options.debug
        : (msg: string, ...args: unknown[]) => console.debug(`[ragora] ${msg}`, ...args);
    }
  }

  /**
   * Extract retry delay from response headers (Retry-After or X-RateLimit-Reset).
   */
  private static getRetryAfter(headers: Headers): number | undefined {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const parsed = parseFloat(retryAfter);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const reset = headers.get('X-RateLimit-Reset');
    if (reset) {
      const parsed = parseFloat(reset);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return undefined;
  }

  private log(msg: string, ...args: unknown[]): void {
    this.debugLog?.(msg, ...args);
  }

  private static buildError(
    message: string,
    statusCode: number,
    error?: APIError,
    requestId?: string,
    retryAfter?: number
  ): RagoraError {
    if (statusCode === 401) return new AuthenticationError(message, error, requestId);
    if (statusCode === 403) return new AuthorizationError(message, error, requestId);
    if (statusCode === 404) return new NotFoundError(message, error, requestId);
    if (statusCode === 429) return new RateLimitError(message, error, requestId, retryAfter);
    if (statusCode >= 500) return new ServerError(message, statusCode, error, requestId);
    return new RagoraError(message, statusCode, error, requestId);
  }

  /**
   * Calculate retry delay with exponential backoff and jitter.
   *
   * If the server sent a Retry-After / X-RateLimit-Reset header, that value
   * is used as the base delay (uncapped — the server knows best). Otherwise
   * falls back to exponential backoff capped at 30 seconds.
   */
  private static retryDelay(
    attempt: number,
    retryAfter?: number
  ): number {
    const base =
      retryAfter !== undefined && retryAfter > 0
        ? retryAfter
        : Math.min(2 ** attempt, 30); // 1, 2, 4, 8, 16, 30
    // Jitter: 0.5x–1.0x of base
    return base * (0.5 + Math.random() * 0.5);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract metadata from response headers.
   */
  private extractMetadata(headers: Headers): ResponseMetadata {
    const safeFloat = (key: string): number | undefined => {
      const val = headers.get(key);
      if (val) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
      }
      return undefined;
    };

    const safeInt = (key: string): number | undefined => {
      const val = headers.get(key);
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) return parsed;
      }
      return undefined;
    };

    return {
      requestId: headers.get('X-Request-ID') ?? undefined,
      apiVersion: headers.get('X-Ragora-API-Version') ?? undefined,
      costUsd: safeFloat('X-Ragora-Cost-USD'),
      balanceRemainingUsd: safeFloat('X-Ragora-Balance-Remaining-USD'),
      rateLimitLimit: safeInt('X-RateLimit-Limit'),
      rateLimitRemaining: safeInt('X-RateLimit-Remaining'),
      rateLimitReset: safeInt('X-RateLimit-Reset'),
    };
  }

  /**
   * Make an API request with automatic retry for rate-limit and server errors.
   */
  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | undefined>;
      requestId?: string;
      timeout?: number;
    }
  ): Promise<{ data: T; metadata: ResponseMetadata }> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const effectiveTimeout = options?.timeout ?? this.timeout;
    this.log(`Request: ${method} ${path}`);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const response = await this.fetchFn(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent,
            ...(options?.requestId && { 'X-Request-ID': options.requestId }),
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        this.log(`Response: ${method} ${path} -> ${response.status}`);
        const metadata = this.extractMetadata(response.headers);

        if (response.ok) {
          const data = (await response.json()) as T;
          return { data, metadata };
        }

        if (
          RagoraClient.RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < this.maxRetries
        ) {
          const delay = RagoraClient.retryDelay(
            attempt,
            RagoraClient.getRetryAfter(response.headers)
          );
          this.log(`Retry attempt ${attempt + 1} after ${(delay).toFixed(1)}s delay`);
          await this.sleep(delay * 1000);
          continue;
        }

        await this.handleError(response, metadata.requestId);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Unreachable — handleError always throws
    throw new RagoraError('request failed', 0);
  }

  /**
   * Handle error responses.
   */
  private async handleError(
    response: Response,
    requestId?: string
  ): Promise<never> {
    const retryAfter = RagoraClient.getRetryAfter(response.headers);
    try {
      const data = (await response.json()) as Record<string, unknown>;

      if (data.error) {
        const errorData = data.error as Record<string, unknown>;
        if (typeof errorData === 'object') {
          const error: APIError = {
            code: String(errorData.code ?? 'unknown'),
            message: String(errorData.message ?? 'Unknown error'),
            details: Array.isArray(errorData.details) ? errorData.details : [],
            requestId,
          };
          throw RagoraClient.buildError(
            error.message,
            response.status,
            error,
            requestId,
            retryAfter
          );
        }
        throw RagoraClient.buildError(
          String(errorData),
          response.status,
          undefined,
          requestId,
          retryAfter
        );
      }

      throw RagoraClient.buildError(
        String(data.message ?? response.statusText),
        response.status,
        undefined,
        requestId,
        retryAfter
      );
    } catch (e) {
      if (e instanceof RagoraError) throw e;

      throw RagoraClient.buildError(
        response.statusText || `HTTP ${response.status}`,
        response.status,
        undefined,
        requestId,
        retryAfter
      );
    }
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private toSearchResult(raw: Record<string, unknown>): SearchResult {
    const scoreRaw = raw.score;
    const parsedScore =
      typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw ?? 0);

    const metadata = RagoraClient.isRecord(raw.metadata)
      ? raw.metadata
      : {};

    // Extract source_url: prefer top-level field, fall back to metadata
    const sourceUrl =
      (typeof raw.source_url === 'string' && raw.source_url ? raw.source_url : undefined) ??
      (RagoraClient.isRecord(raw.metadata) && typeof (raw.metadata as Record<string, unknown>).source_url === 'string'
        ? (raw.metadata as Record<string, unknown>).source_url as string
        : undefined);

    return {
      id: String(raw.id ?? raw.chunk_id ?? ''),
      content:
        (typeof raw.text === 'string' ? raw.text : undefined) ??
        (typeof raw.content === 'string' ? raw.content : ''),
      score: Number.isFinite(parsedScore) ? parsedScore : 0,
      sourceUrl: sourceUrl || undefined,
      metadata,
      documentId:
        typeof raw.document_id === 'string' ? raw.document_id : undefined,
      collectionId:
        typeof raw.collection_id === 'string' ? raw.collection_id : undefined,
      pageNumber:
        typeof raw.page_number === 'number' ? raw.page_number
        : typeof metadata.page_number === 'number' ? metadata.page_number as number
        : undefined,
      sectionHeading:
        typeof raw.section_heading === 'string' ? raw.section_heading
        : typeof metadata.section_heading === 'string' ? metadata.section_heading as string
        : undefined,
    };
  }

  private mapSearchResults(rawResults: unknown): SearchResult[] {
    if (!Array.isArray(rawResults)) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const raw of rawResults) {
      if (!RagoraClient.isRecord(raw)) {
        continue;
      }
      results.push(this.toSearchResult(raw));
    }
    return results;
  }

  private extractChatSources(payload: Record<string, unknown>): SearchResult[] {
    const ragoraStats = payload.ragora_stats;
    if (RagoraClient.isRecord(ragoraStats) && Array.isArray(ragoraStats.sources)) {
      return this.mapSearchResults(ragoraStats.sources);
    }
    return this.mapSearchResults(payload.sources);
  }

  private normalizeIdentifierKey(value: string): string {
    return value.trim().toLowerCase();
  }

  private cacheGet(
    cache: Map<string, { resolvedId: string; expiresAt: number }>,
    key: string
  ): string | undefined {
    const cached = cache.get(key);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return cached.resolvedId;
  }

  private cacheSet(
    cache: Map<string, { resolvedId: string; expiresAt: number }>,
    key: string,
    resolvedId: string
  ): void {
    cache.set(key, {
      resolvedId,
      expiresAt: Date.now() + this.resolverCacheTtlMs,
    });
  }

  private previewId(rawId: string): string {
    if (rawId.length <= 10) {
      return rawId;
    }
    return `${rawId.slice(0, 8)}...`;
  }

  private throwAmbiguousIdentifier(
    kind: 'collection' | 'product',
    identifier: string,
    candidates: string[]
  ): never {
    const message =
      `Ambiguous ${kind} '${identifier}'. ` +
      `Matches: ${candidates.slice(0, 5).join(', ')}. ` +
      'Use slug or UUID for an exact match.';
    throw new RagoraError(message, 400, {
      code: 'AMBIGUOUS_IDENTIFIER',
      message,
      details: [],
    });
  }

  private throwIdentifierNotFound(
    kind: 'collection' | 'product',
    identifier: string
  ): never {
    const message =
      `${kind.charAt(0).toUpperCase()}${kind.slice(1)} '${identifier}' was not found in your accessible scope. ` +
      'Use list endpoints or pass slug/UUID.';
    throw new RagoraError(message, 404, {
      code: 'IDENTIFIER_NOT_FOUND',
      message,
      details: [],
    });
  }

  private throwConflictingReferenceInputs(
    preferred: string,
    legacy: string
  ): never {
    throw new Error(`Pass either '${preferred}' or '${legacy}', not both.`);
  }

  private normalizeReferenceList(
    refs: string | string[],
    label: string
  ): string[] {
    const rawValues = Array.isArray(refs) ? refs : [refs];
    const normalized: string[] = [];

    for (const value of rawValues) {
      if (typeof value !== 'string') {
        throw new TypeError(`${label} values must be strings.`);
      }
      const cleaned = value.trim();
      if (cleaned.length === 0) {
        throw new Error(`${label} cannot contain empty values.`);
      }
      normalized.push(cleaned);
    }

    if (normalized.length === 0) {
      throw new Error(`${label} cannot be empty.`);
    }
    return normalized;
  }

  private dedupePreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const value of values) {
      const normalized = this.normalizeIdentifierKey(value);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      deduped.push(value);
    }
    return deduped;
  }

  private async listAccessibleCollectionsRaw(): Promise<Record<string, unknown>[]> {
    const allItems: Record<string, unknown>[] = [];
    const limit = 100;
    let offset = 0;

    for (let i = 0; i < 50; i++) {
      const { data } = await this.request<{
        data?: unknown;
        hasMore?: boolean;
        has_more?: boolean;
      }>('GET', '/v1/collections', {
        params: { limit, offset },
      });

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (RagoraClient.isRecord(item)) {
            allItems.push(item);
          }
        }
      }

      const hasMore = Boolean(data.hasMore ?? data.has_more ?? false);
      if (!hasMore) {
        break;
      }
      offset += limit;
    }

    return allItems;
  }

  private async listAccessibleProductsRaw(): Promise<Record<string, unknown>[]> {
    const { data } = await this.request<{ data?: unknown }>(
      'GET',
      '/v1/products/accessible'
    );
    if (!Array.isArray(data.data)) {
      return [];
    }

    const items: Record<string, unknown>[] = [];
    for (const item of data.data) {
      if (RagoraClient.isRecord(item)) {
        items.push(item);
      }
    }
    return items;
  }

  private async resolveCollection(collection: string): Promise<string> {
    const ref = collection.trim();
    if (!ref) {
      throw new Error('collection cannot be empty');
    }

    const cacheKey = this.normalizeIdentifierKey(ref);
    const cached = this.cacheGet(this.collectionRefCache, cacheKey);
    if (cached) {
      return cached;
    }

    if (RagoraClient.UUID_PATTERN.test(ref)) {
      this.cacheSet(this.collectionRefCache, cacheKey, ref);
      return ref;
    }

    const refLower = ref.toLowerCase();
    const collections = await this.listAccessibleCollectionsRaw();

    const idMatches = collections.filter(
      (item) => typeof item.id === 'string' && item.id === ref
    );
    if (idMatches.length === 1) {
      const resolved = String(idMatches[0].id);
      this.cacheSet(this.collectionRefCache, cacheKey, resolved);
      return resolved;
    }

    const slugMatches = collections.filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.slug === 'string' &&
        item.slug.toLowerCase() === refLower
    );
    if (slugMatches.length === 1) {
      const resolved = String(slugMatches[0].id ?? '');
      this.cacheSet(this.collectionRefCache, cacheKey, resolved);
      return resolved;
    }

    const nameMatches = collections.filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        item.name.toLowerCase() === refLower
    );
    if (nameMatches.length > 1) {
      const candidates = nameMatches.map((match) => {
        const name = typeof match.name === 'string' ? match.name : '';
        const slug = typeof match.slug === 'string' ? match.slug : '-';
        const id = typeof match.id === 'string' ? match.id : '';
        return `${name} (slug=${slug}, id=${this.previewId(id)})`;
      });
      this.throwAmbiguousIdentifier('collection', ref, candidates);
    }
    if (nameMatches.length === 1) {
      const resolved = String(nameMatches[0].id ?? '');
      this.cacheSet(this.collectionRefCache, cacheKey, resolved);
      return resolved;
    }

    const products = await this.listAccessibleProductsRaw();
    const productSlugMatches = products.filter(
      (item) =>
        typeof item.slug === 'string' && item.slug.toLowerCase() === refLower
    );
    const productTitleMatches = products.filter(
      (item) =>
        typeof item.title === 'string' && item.title.toLowerCase() === refLower
    );
    const productCollectionSlugMatches = products.filter(
      (item) =>
        typeof item.collection_slug === 'string' &&
        item.collection_slug.toLowerCase() === refLower
    );
    const productCollectionNameMatches = products.filter(
      (item) =>
        typeof item.collection_name === 'string' &&
        item.collection_name.toLowerCase() === refLower
    );
    const baseProductMatches =
      productSlugMatches.length > 0
        ? productSlugMatches
        : productTitleMatches.length > 0
          ? productTitleMatches
          : productCollectionSlugMatches.length > 0
            ? productCollectionSlugMatches
            : productCollectionNameMatches;
    const productMatches = baseProductMatches.filter(
      (item) =>
        typeof item.collection_id === 'string' && item.collection_id.trim() !== ''
    );
    if (productMatches.length > 1) {
      const candidates = productMatches.map((match) => {
        const title = typeof match.title === 'string' ? match.title : '';
        const slug = typeof match.slug === 'string' ? match.slug : '-';
        const id = typeof match.id === 'string' ? match.id : '';
        return `${title} (slug=${slug}, id=${this.previewId(id)})`;
      });
      this.throwAmbiguousIdentifier('collection', ref, candidates);
    }
    if (productMatches.length === 1) {
      const resolved = String(productMatches[0].collection_id);
      this.cacheSet(this.collectionRefCache, cacheKey, resolved);
      return resolved;
    }

    this.throwIdentifierNotFound('collection', ref);
  }

  private async resolveProduct(product: string): Promise<string> {
    const ref = product.trim();
    if (!ref) {
      throw new Error('product cannot be empty');
    }

    const cacheKey = this.normalizeIdentifierKey(ref);
    const cached = this.cacheGet(this.productRefCache, cacheKey);
    if (cached) {
      return cached;
    }

    if (RagoraClient.UUID_PATTERN.test(ref)) {
      this.cacheSet(this.productRefCache, cacheKey, ref);
      return ref;
    }

    const refLower = ref.toLowerCase();
    const products = await this.listAccessibleProductsRaw();

    const idMatches = products.filter(
      (item) => typeof item.id === 'string' && item.id === ref
    );
    if (idMatches.length === 1) {
      const resolved = String(idMatches[0].id);
      this.cacheSet(this.productRefCache, cacheKey, resolved);
      return resolved;
    }

    const slugMatches = products.filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.slug === 'string' &&
        item.slug.toLowerCase() === refLower
    );
    if (slugMatches.length === 1) {
      const resolved = String(slugMatches[0].id ?? '');
      this.cacheSet(this.productRefCache, cacheKey, resolved);
      return resolved;
    }

    const titleMatches = products.filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        item.title.toLowerCase() === refLower
    );
    if (titleMatches.length > 1) {
      const candidates = titleMatches.map((match) => {
        const title = typeof match.title === 'string' ? match.title : '';
        const slug = typeof match.slug === 'string' ? match.slug : '-';
        const id = typeof match.id === 'string' ? match.id : '';
        return `${title} (slug=${slug}, id=${this.previewId(id)})`;
      });
      this.throwAmbiguousIdentifier('product', ref, candidates);
    }
    if (titleMatches.length === 1) {
      const resolved = String(titleMatches[0].id ?? '');
      this.cacheSet(this.productRefCache, cacheKey, resolved);
      return resolved;
    }

    this.throwIdentifierNotFound('product', ref);
  }

  private async resolveCollectionIds(options: {
    collection?: string | string[];
    collectionId?: string | string[];
  }): Promise<string[] | undefined> {
    if (options.collection !== undefined && options.collectionId !== undefined) {
      this.throwConflictingReferenceInputs('collection', 'collectionId');
    }

    if (options.collection === undefined) {
      if (options.collectionId === undefined) {
        return undefined;
      }
      const legacyRefs = this.normalizeReferenceList(
        options.collectionId,
        'collectionId'
      );
      return this.dedupePreserveOrder(legacyRefs);
    }

    const refs = this.normalizeReferenceList(options.collection, 'collection');
    const resolved: string[] = [];
    for (const ref of refs) {
      resolved.push(await this.resolveCollection(ref));
    }
    return this.dedupePreserveOrder(resolved);
  }

  private async resolveSingleCollectionId(options: {
    collection?: string;
    collectionId?: string;
  }): Promise<string | undefined> {
    const resolved = await this.resolveCollectionIds({
      collection: options.collection,
      collectionId: options.collectionId,
    });
    if (!resolved) {
      return undefined;
    }
    if (resolved.length !== 1) {
      throw new Error('Exactly one collection must be provided for this operation.');
    }
    return resolved[0];
  }

  private async resolveProductIds(options: {
    products?: string | string[];
    productIds?: string[];
  }): Promise<string[] | undefined> {
    if (options.products !== undefined && options.productIds !== undefined) {
      this.throwConflictingReferenceInputs('products', 'productIds');
    }

    if (options.products === undefined) {
      if (options.productIds === undefined) {
        return undefined;
      }
      const legacyRefs = this.normalizeReferenceList(
        options.productIds,
        'productIds'
      );
      return this.dedupePreserveOrder(legacyRefs);
    }

    const refs = this.normalizeReferenceList(options.products, 'products');
    const resolved: string[] = [];
    for (const ref of refs) {
      resolved.push(await this.resolveProduct(ref));
    }
    return this.dedupePreserveOrder(resolved);
  }

  // --- Search ---

  /**
   * Search for relevant documents in a collection.
   */
  async search(request: SearchRequest, options?: RequestOptions): Promise<SearchResponse> {
    const collectionIds = await this.resolveCollectionIds({
      collection: request.collection,
      collectionId: request.collectionId,
    });

    const { data, metadata } = await this.request<{
      object?: string;
      results: unknown;
      fragments?: unknown;
      system_instruction?: string;
      knowledge_graph?: Record<string, unknown>;
      global_graph_context?: Record<string, unknown>;
      knowledge_graph_summary?: string;
      graph_debug?: Record<string, unknown>;
    }>('POST', '/v1/retrieve', {
      body: {
        ...(collectionIds && { collection_ids: collectionIds }),
        query: request.query,
        top_k: request.topK ?? 5,
        ...(request.filters && { filters: request.filters }),
        ...(request.sourceType && { source_type: request.sourceType }),
        ...(request.sourceName && { source_name: request.sourceName }),
        ...(request.version && { version: request.version }),
        ...(request.versionMode && { version_mode: request.versionMode }),
        ...(request.documentKeys && { document_keys: request.documentKeys }),
        ...(request.customTags && { custom_tags: request.customTags }),
        ...(request.domain && { domain: request.domain }),
        ...(request.domainFilterMode && { domain_filter_mode: request.domainFilterMode }),
        ...(request.enableReranker !== undefined && { enable_reranker: request.enableReranker }),
        ...(request.graphFilter && {
          graph_filter: {
            ...(request.graphFilter.entities && { entities: request.graphFilter.entities }),
            ...(request.graphFilter.entityType && { entity_type: request.graphFilter.entityType }),
            ...(request.graphFilter.versionOf && { version_of: request.graphFilter.versionOf }),
            ...(request.graphFilter.relationType && { relation_type: request.graphFilter.relationType }),
            ...(request.graphFilter.fileIds && { file_ids: request.graphFilter.fileIds }),
            ...(request.graphFilter.mode && { mode: request.graphFilter.mode }),
          },
        }),
        ...(request.temporalFilter && {
          temporal_filter: {
            ...(request.temporalFilter.asOf && { as_of: request.temporalFilter.asOf }),
            ...(request.temporalFilter.since && { since: request.temporalFilter.since }),
            ...(request.temporalFilter.until && { until: request.temporalFilter.until }),
            ...(request.temporalFilter.recencyWeight !== undefined && { recency_weight: request.temporalFilter.recencyWeight }),
            ...(request.temporalFilter.recencyDecay && { recency_decay: request.temporalFilter.recencyDecay }),
            ...(request.temporalFilter.decayHalfLife !== undefined && { decay_half_life: request.temporalFilter.decayHalfLife }),
          },
        }),
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const results = this.mapSearchResults(data.results);
    const fragments = Array.isArray(data.fragments)
      ? data.fragments.filter(RagoraClient.isRecord)
      : undefined;

    return {
      object: data.object,
      results,
      fragments,
      systemInstruction: data.system_instruction,
      knowledgeGraph: RagoraClient.isRecord(data.knowledge_graph)
        ? data.knowledge_graph
        : undefined,
      globalGraphContext: RagoraClient.isRecord(data.global_graph_context)
        ? data.global_graph_context
        : undefined,
      knowledgeGraphSummary: data.knowledge_graph_summary,
      graphDebug: RagoraClient.isRecord(data.graph_debug)
        ? data.graph_debug
        : undefined,
      query: request.query,
      total: results.length,
      ...metadata,
    };
  }

  // --- Chat ---

  /**
   * Generate a chat completion with RAG context.
   */
  async chat(request: ChatRequest, options?: RequestOptions): Promise<ChatResponse> {
    const retrieval = request.retrieval ?? {};
    const generation = request.generation ?? {};
    const agentic = request.agentic ?? {};

    const collectionIds = await this.resolveCollectionIds({
      collection: retrieval.collection,
      collectionId: retrieval.collectionId,
    });
    const productIds = await this.resolveProductIds({
      products: retrieval.products,
      productIds: retrieval.productIds,
    });

    const { data, metadata } = await this.request<{
      id: string;
      object: string;
      created: number;
      model: string;
      choices: Array<{
        index: number;
        message: { role: string; content: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      sources?: unknown;
      ragora_stats?: {
        sources?: unknown;
      };
      ragora?: {
        citations?: Array<{ ref?: number; text?: string; source?: string; score?: number }>;
        session_id?: string;
      };
    }>('POST', '/v1/chat/completions', {
      body: {
        ...(collectionIds && { collection_ids: collectionIds }),
        ...(productIds && { product_ids: productIds }),
        messages: request.messages,
        ...(generation.model && { model: generation.model }),
        temperature: generation.temperature ?? 0.7,
        max_tokens: generation.maxTokens,
        top_k: retrieval.topK,
        stream: false,
        ...(agentic.mode && { mode: agentic.mode }),
        ...(agentic.systemPrompt && { system_prompt: agentic.systemPrompt }),
        ...(agentic.session !== undefined && { session: agentic.session }),
        ...(agentic.sessionId && { session_id: agentic.sessionId }),
        ...(retrieval.sourceType && { source_type: retrieval.sourceType }),
        ...(retrieval.sourceName && { source_name: retrieval.sourceName }),
        ...(retrieval.version && { version: retrieval.version }),
        ...(retrieval.versionMode && { version_mode: retrieval.versionMode }),
        ...(retrieval.documentKeys && { document_keys: retrieval.documentKeys }),
        ...(retrieval.customTags && { custom_tags: retrieval.customTags }),
        ...(retrieval.domain && { domain: retrieval.domain }),
        ...(retrieval.domainFilterMode && { domain_filter_mode: retrieval.domainFilterMode }),
        ...(retrieval.filters && { filters: retrieval.filters }),
        ...(retrieval.enableReranker !== undefined && { enable_reranker: retrieval.enableReranker }),
        ...(retrieval.graphFilter && {
          graph_filter: {
            ...(retrieval.graphFilter.entities && { entities: retrieval.graphFilter.entities }),
            ...(retrieval.graphFilter.entityType && { entity_type: retrieval.graphFilter.entityType }),
            ...(retrieval.graphFilter.versionOf && { version_of: retrieval.graphFilter.versionOf }),
            ...(retrieval.graphFilter.relationType && { relation_type: retrieval.graphFilter.relationType }),
            ...(retrieval.graphFilter.fileIds && { file_ids: retrieval.graphFilter.fileIds }),
            ...(retrieval.graphFilter.mode && { mode: retrieval.graphFilter.mode }),
          },
        }),
        ...(retrieval.temporalFilter && {
          temporal_filter: {
            ...(retrieval.temporalFilter.asOf && { as_of: retrieval.temporalFilter.asOf }),
            ...(retrieval.temporalFilter.since && { since: retrieval.temporalFilter.since }),
            ...(retrieval.temporalFilter.until && { until: retrieval.temporalFilter.until }),
            ...(retrieval.temporalFilter.recencyWeight !== undefined && { recency_weight: retrieval.temporalFilter.recencyWeight }),
            ...(retrieval.temporalFilter.recencyDecay && { recency_decay: retrieval.temporalFilter.recencyDecay }),
            ...(retrieval.temporalFilter.decayHalfLife !== undefined && { decay_half_life: retrieval.temporalFilter.decayHalfLife }),
          },
        }),
        ...(request.metadata && {
          metadata: {
            ...(request.metadata.source && { source: request.metadata.source }),
            ...(request.metadata.installationId && { installation_id: request.metadata.installationId }),
            ...(request.metadata.channelId && { channel_id: request.metadata.channelId }),
            ...(request.metadata.requesterId && { requester_id: request.metadata.requesterId }),
          },
        }),
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const choices: ChatChoice[] = data.choices.map((c) => ({
      index: c.index,
      message: {
        role: c.message.role as 'user' | 'assistant' | 'system',
        content: c.message.content,
      },
      finishReason: c.finish_reason,
    }));

    const sources = this.extractChatSources(data as Record<string, unknown>);

    // Parse ragora namespace (present in agentic mode)
    let ragora: ChatResponse['ragora'];
    if (data.ragora) {
      ragora = {
        citations: (data.ragora.citations ?? []).map((c) => ({
          ref: c.ref ?? 0,
          text: c.text,
          source: c.source,
          score: c.score,
        })),
        sessionId: data.ragora.session_id,
      };
    }

    return {
      id: data.id,
      object: data.object,
      created: data.created,
      model: data.model,
      choices,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      sources,
      ragora,
      ...metadata,
    };
  }

  /**
   * Stream a chat completion with RAG context.
   */
  async *chatStream(request: ChatRequest, options?: RequestOptions): AsyncGenerator<ChatStreamChunk> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const retrieval = request.retrieval ?? {};
    const generation = request.generation ?? {};
    const agentic = request.agentic ?? {};

    const collectionIds = await this.resolveCollectionIds({
      collection: retrieval.collection,
      collectionId: retrieval.collectionId,
    });
    const productIds = await this.resolveProductIds({
      products: retrieval.products,
      productIds: retrieval.productIds,
    });

    const effectiveTimeout = options?.timeout ?? this.timeout;
    const controller = new AbortController();
    // Use an inactivity timeout that resets on each chunk, not a fixed wall-clock timeout
    let timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    };

    this.log('Request: POST /v1/chat/completions (stream)');

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          ...(options?.requestId && { 'X-Request-ID': options.requestId }),
        },
        body: JSON.stringify({
          ...(collectionIds && { collection_ids: collectionIds }),
          ...(productIds && { product_ids: productIds }),
          messages: request.messages,
          ...(generation.model && { model: generation.model }),
          temperature: generation.temperature ?? 0.7,
          max_tokens: generation.maxTokens,
          top_k: retrieval.topK,
          stream: true,
          ...(agentic.mode && { mode: agentic.mode }),
          ...(agentic.systemPrompt && { system_prompt: agentic.systemPrompt }),
          ...(agentic.session !== undefined && { session: agentic.session }),
          ...(agentic.sessionId && { session_id: agentic.sessionId }),
          ...(retrieval.sourceType && { source_type: retrieval.sourceType }),
          ...(retrieval.sourceName && { source_name: retrieval.sourceName }),
          ...(retrieval.version && { version: retrieval.version }),
          ...(retrieval.versionMode && { version_mode: retrieval.versionMode }),
          ...(retrieval.documentKeys && { document_keys: retrieval.documentKeys }),
          ...(retrieval.customTags && { custom_tags: retrieval.customTags }),
          ...(retrieval.domain && { domain: retrieval.domain }),
          ...(retrieval.domainFilterMode && { domain_filter_mode: retrieval.domainFilterMode }),
          ...(retrieval.filters && { filters: retrieval.filters }),
          ...(retrieval.enableReranker !== undefined && { enable_reranker: retrieval.enableReranker }),
          ...(retrieval.graphFilter && {
            graph_filter: {
              ...(retrieval.graphFilter.entities && { entities: retrieval.graphFilter.entities }),
              ...(retrieval.graphFilter.entityType && { entity_type: retrieval.graphFilter.entityType }),
              ...(retrieval.graphFilter.versionOf && { version_of: retrieval.graphFilter.versionOf }),
              ...(retrieval.graphFilter.relationType && { relation_type: retrieval.graphFilter.relationType }),
              ...(retrieval.graphFilter.fileIds && { file_ids: retrieval.graphFilter.fileIds }),
              ...(retrieval.graphFilter.mode && { mode: retrieval.graphFilter.mode }),
            },
          }),
          ...(retrieval.temporalFilter && {
            temporal_filter: {
              ...(retrieval.temporalFilter.asOf && { as_of: retrieval.temporalFilter.asOf }),
              ...(retrieval.temporalFilter.since && { since: retrieval.temporalFilter.since }),
              ...(retrieval.temporalFilter.until && { until: retrieval.temporalFilter.until }),
              ...(retrieval.temporalFilter.recencyWeight !== undefined && { recency_weight: retrieval.temporalFilter.recencyWeight }),
              ...(retrieval.temporalFilter.recencyDecay && { recency_decay: retrieval.temporalFilter.recencyDecay }),
              ...(retrieval.temporalFilter.decayHalfLife !== undefined && { decay_half_life: retrieval.temporalFilter.decayHalfLife }),
            },
          }),
          ...(request.metadata && {
            metadata: {
              ...(request.metadata.source && { source: request.metadata.source }),
              ...(request.metadata.installationId && { installation_id: request.metadata.installationId }),
              ...(request.metadata.channelId && { channel_id: request.metadata.channelId }),
              ...(request.metadata.requesterId && { requester_id: request.metadata.requesterId }),
            },
          }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const metadata = this.extractMetadata(response.headers);
        await this.handleError(response, metadata.requestId);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines: string[] = [];
      let sessionId: string | undefined;

      const parseEvent = (
        currentEvent: string,
        currentDataLines: string[]
      ): { chunk?: ChatStreamChunk; done: boolean } => {
        if (currentDataLines.length === 0) {
          return { done: false };
        }

        const dataStr = currentDataLines.join('\n');
        if (dataStr === '[DONE]') {
          return { done: true };
        }

        try {
          const parsed = JSON.parse(dataStr) as Record<string, unknown>;
          if (!RagoraClient.isRecord(parsed)) {
            return { done: false };
          }

          let ragoraStats: Record<string, unknown> | undefined;
          if (RagoraClient.isRecord(parsed.ragora_stats)) {
            ragoraStats = parsed.ragora_stats as Record<string, unknown>;
            if (typeof ragoraStats.conversation_id === 'string') {
              sessionId = ragoraStats.conversation_id;
            }
          }

          if (currentEvent === 'ragora_status' || currentEvent === 'ragora.step') {
            const stepType =
              typeof parsed.type === 'string' ? parsed.type : 'working';
            const stepMessage =
              typeof parsed.status === 'string'
                ? parsed.status
                : typeof parsed.message === 'string'
                  ? parsed.message
                  : 'Working...';
            return {
              done: false,
              chunk: {
                content: '',
                sources: [],
                sessionId,
                thinking: {
                  type: stepType,
                  message: stepMessage,
                  timestamp: Date.now(),
                },
              },
            };
          }

          if (
            currentEvent === 'ragora_metadata' ||
            currentEvent === 'ragora_complete'
          ) {
            const sources = this.extractChatSources(parsed);
            if (sources.length === 0 && !sessionId && currentEvent !== 'ragora_complete') {
              return { done: false };
            }
            return {
              done: false,
              chunk: {
                content: '',
                sources,
                sessionId,
                ...(currentEvent === 'ragora_complete' && ragoraStats
                  ? { stats: ragoraStats }
                  : {}),
              },
            };
          }

          const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
          const firstChoice =
            choices.length > 0 && RagoraClient.isRecord(choices[0])
              ? choices[0]
              : {};
          const delta = RagoraClient.isRecord(firstChoice.delta)
            ? firstChoice.delta
            : {};

          const content = typeof delta.content === 'string' ? delta.content : '';
          const finishReason =
            typeof firstChoice.finish_reason === 'string'
              ? firstChoice.finish_reason
              : undefined;
          const sources = this.extractChatSources(parsed);

          if (!content && !finishReason && sources.length === 0) {
            return { done: false };
          }

          return {
            done: false,
            chunk: {
              content,
              finishReason,
              sources,
              sessionId,
            },
          };
        } catch {
          return { done: false };
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const tail = buffer.trimEnd();
          if (tail.startsWith('event:')) {
            eventName = tail.slice(6).trim() || 'message';
          } else if (tail.startsWith('data:')) {
            dataLines.push(tail.slice(5).trimStart());
          }

          const parsed = parseEvent(eventName, dataLines);
          if (parsed.chunk) {
            yield parsed.chunk;
          }
          break;
        }
        resetTimeout();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();

          if (!line) {
            const parsed = parseEvent(eventName, dataLines);
            dataLines = [];
            eventName = 'message';

            if (parsed.chunk) {
              yield parsed.chunk;
            }
            if (parsed.done) {
              return;
            }
            continue;
          }

          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || 'message';
            continue;
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Credits ---

  /**
   * Get current credit balance.
   */
  async getBalance(options?: RequestOptions): Promise<CreditBalance> {
    const { data, metadata } = await this.request<{
      balance_usd: number;
      currency?: string;
    }>('GET', '/v1/credits/balance', {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      balanceUsd: data.balance_usd,
      currency: data.currency ?? 'USD',
      ...metadata,
    };
  }

  // --- Collections ---

  /**
   * List your collections.
   */
  async listCollections(
    request?: CollectionListRequest,
    options?: RequestOptions
  ): Promise<CollectionListResponse> {
    const { data, metadata } = await this.request<{
      data: Array<{
        id: string;
        owner_id?: string;
        name: string;
        slug?: string;
        description?: string;
        total_documents?: number;
        total_vectors?: number;
        total_chunks?: number;
        total_size_bytes?: number;
        created_at?: string;
        updated_at?: string;
      }>;
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    }>('GET', '/v1/collections', {
      params: {
        limit: request?.limit,
        offset: request?.offset,
        search: request?.search,
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const collections: Collection[] = data.data.map((c) => ({
      id: c.id,
      ownerId: c.owner_id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      totalDocuments: c.total_documents ?? 0,
      totalVectors: c.total_vectors ?? 0,
      totalChunks: c.total_chunks ?? 0,
      totalSizeBytes: c.total_size_bytes ?? 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return {
      data: collections,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      hasMore: data.hasMore,
      ...metadata,
    };
  }

  /**
   * Get a specific collection by ID or slug.
   */
  async getCollection(collectionId: string, options?: RequestOptions): Promise<Collection> {
    const { data } = await this.request<{
      data?: {
        id: string;
        owner_id?: string;
        name: string;
        slug?: string;
        description?: string;
        total_documents?: number;
        total_vectors?: number;
        total_chunks?: number;
        total_size_bytes?: number;
        created_at?: string;
        updated_at?: string;
      };
      id: string;
      owner_id?: string;
      name: string;
      slug?: string;
      description?: string;
      total_documents?: number;
      total_vectors?: number;
      total_chunks?: number;
      total_size_bytes?: number;
      created_at?: string;
      updated_at?: string;
    }>('GET', `/v1/collections/${collectionId}`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    // Handle nested data structure
    const collData = data.data ?? data;

    return {
      id: collData.id,
      ownerId: collData.owner_id,
      name: collData.name,
      slug: collData.slug,
      description: collData.description,
      totalDocuments: collData.total_documents ?? 0,
      totalVectors: collData.total_vectors ?? 0,
      totalChunks: collData.total_chunks ?? 0,
      totalSizeBytes: collData.total_size_bytes ?? 0,
      createdAt: collData.created_at,
      updatedAt: collData.updated_at,
    };
  }

  /**
   * Create a new collection.
   */
  async createCollection(request: CreateCollectionRequest, options?: RequestOptions): Promise<Collection> {
    const { data } = await this.request<{
      data?: {
        id: string;
        owner_id?: string;
        name: string;
        slug?: string;
        description?: string;
        total_documents?: number;
        total_vectors?: number;
        total_chunks?: number;
        total_size_bytes?: number;
        created_at?: string;
        updated_at?: string;
      };
      id: string;
      owner_id?: string;
      name: string;
      slug?: string;
      description?: string;
      total_documents?: number;
      total_vectors?: number;
      total_chunks?: number;
      total_size_bytes?: number;
      created_at?: string;
      updated_at?: string;
    }>('POST', '/v1/collections', {
      body: {
        name: request.name,
        description: request.description,
        slug: request.slug,
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    // Handle nested data structure
    const collData = data.data ?? data;

    return {
      id: collData.id,
      ownerId: collData.owner_id,
      name: collData.name,
      slug: collData.slug,
      description: collData.description,
      totalDocuments: collData.total_documents ?? 0,
      totalVectors: collData.total_vectors ?? 0,
      totalChunks: collData.total_chunks ?? 0,
      totalSizeBytes: collData.total_size_bytes ?? 0,
      createdAt: collData.created_at,
      updatedAt: collData.updated_at,
    };
  }

  /**
   * Update an existing collection.
   */
  async updateCollection(
    collectionId: string,
    request: UpdateCollectionRequest,
    options?: RequestOptions
  ): Promise<Collection> {
    const { data } = await this.request<{
      data?: {
        id: string;
        owner_id?: string;
        name: string;
        slug?: string;
        description?: string;
        total_documents?: number;
        total_vectors?: number;
        total_chunks?: number;
        total_size_bytes?: number;
        created_at?: string;
        updated_at?: string;
      };
      id: string;
      owner_id?: string;
      name: string;
      slug?: string;
      description?: string;
      total_documents?: number;
      total_vectors?: number;
      total_chunks?: number;
      total_size_bytes?: number;
      created_at?: string;
      updated_at?: string;
    }>('PATCH', `/v1/collections/${collectionId}`, {
      body: {
        name: request.name,
        description: request.description,
        slug: request.slug,
        ...(request.capabilityConfig && { capability_config: request.capabilityConfig }),
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    // Handle nested data structure
    const collData = data.data ?? data;

    return {
      id: collData.id,
      ownerId: collData.owner_id,
      name: collData.name,
      slug: collData.slug,
      description: collData.description,
      totalDocuments: collData.total_documents ?? 0,
      totalVectors: collData.total_vectors ?? 0,
      totalChunks: collData.total_chunks ?? 0,
      totalSizeBytes: collData.total_size_bytes ?? 0,
      createdAt: collData.created_at,
      updatedAt: collData.updated_at,
    };
  }

  /**
   * Delete a collection and all its documents.
   */
  async deleteCollection(collectionId: string, options?: RequestOptions): Promise<DeleteResponse> {
    const { data } = await this.request<{
      message: string;
      id: string;
      deleted_at?: string;
    }>('DELETE', `/v1/collections/${collectionId}`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      message: data.message ?? 'Collection deleted',
      id: data.id ?? collectionId,
      deletedAt: data.deleted_at,
    };
  }

  // --- Documents ---

  /**
   * Upload a document to a collection.
   */
  async uploadDocument(request: UploadDocumentRequest, options?: RequestOptions): Promise<UploadResponse> {
    const resolvedCollectionId = await this.resolveSingleCollectionId({
      collection: request.collection,
      collectionId: request.collectionId,
    });

    const url = `${this.baseUrl}/v1/documents`;
    const effectiveTimeout = options?.timeout ?? this.timeout;

    this.log('Request: POST /v1/documents (upload)');

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const formData = new FormData();
      formData.append('file', request.file, request.filename);
      if (resolvedCollectionId) {
        formData.append('collection_id', resolvedCollectionId);
      }
      if (request.relativePath) formData.append('relative_path', request.relativePath);
      if (request.releaseTag) formData.append('release_tag', request.releaseTag);
      if (request.version) formData.append('version', request.version);
      if (request.effectiveAt) formData.append('effective_at', request.effectiveAt);
      if (request.documentTime) formData.append('document_time', request.documentTime);
      if (request.expiresAt) formData.append('expires_at', request.expiresAt);
      if (request.sourceType) formData.append('source_type', request.sourceType);
      if (request.sourceName) formData.append('source_name', request.sourceName);
      if (request.customTags) formData.append('custom_tags', JSON.stringify(request.customTags));
      if (request.domain) formData.append('domain', request.domain);
      if (request.scanMode) formData.append('scan_mode', request.scanMode);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': this.userAgent,
            ...(options?.requestId && { 'X-Request-ID': options.requestId }),
            // Note: Don't set Content-Type for FormData - browser sets it with boundary
          },
          body: formData,
          signal: controller.signal,
        });

        this.log(`Response: POST /v1/documents (upload) -> ${response.status}`);
        const metadata = this.extractMetadata(response.headers);

        if (response.ok) {
          const data = (await response.json()) as {
            id: string;
            file_name?: string;
            status: string;
            collection_id: string;
            collection_slug?: string;
            collection_name?: string;
            message?: string;
          };

          return {
            id: data.id,
            filename: data.file_name ?? request.filename,
            status: data.status ?? 'processing',
            collectionId: data.collection_id ?? resolvedCollectionId ?? '',
            message: data.message,
            ...metadata,
          };
        }

        if (
          RagoraClient.RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < this.maxRetries
        ) {
          const delay = RagoraClient.retryDelay(
            attempt,
            RagoraClient.getRetryAfter(response.headers)
          );
          this.log(`Retry attempt ${attempt + 1} after ${(delay).toFixed(1)}s delay`);
          await this.sleep(delay * 1000);
          continue;
        }

        await this.handleError(response, metadata.requestId);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new RagoraError('upload failed', 0);
  }

  /**
   * Upload a file from disk to a collection.
   *
   * Convenience wrapper around `uploadDocument()` that reads a file from the
   * local filesystem. Only available in Node.js environments.
   */
  async uploadFile(
    filePath: string,
    request?: Omit<UploadDocumentRequest, 'file' | 'filename'>,
    options?: RequestOptions
  ): Promise<UploadResponse> {
    const { readFileSync } = await import('node:fs');
    const { basename } = await import('node:path');
    const content = readFileSync(filePath);
    const filename = basename(filePath);
    return this.uploadDocument(
      { ...request, file: new Blob([content]), filename },
      options
    );
  }

  /**
   * Get the processing status of a document.
   */
  async getDocumentStatus(documentId: string, options?: RequestOptions): Promise<DocumentStatus> {
    const { data } = await this.request<{
      id: string;
      status: string;
      filename: string;
      mime_type?: string;
      vector_count?: number;
      chunk_count?: number;
      progress_percent?: number;
      progress_stage?: string;
      eta_seconds?: number;
      has_transcript?: boolean;
      is_active?: boolean;
      version_number?: number;
      created_at?: string;
    }>('GET', `/v1/documents/${documentId}/status`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      id: data.id ?? documentId,
      status: data.status ?? 'unknown',
      filename: data.filename ?? '',
      mimeType: data.mime_type,
      vectorCount: data.vector_count ?? 0,
      chunkCount: data.chunk_count ?? 0,
      progressPercent: data.progress_percent,
      progressStage: data.progress_stage,
      etaSeconds: data.eta_seconds,
      hasTranscript: data.has_transcript ?? false,
      isActive: data.is_active ?? true,
      versionNumber: data.version_number ?? 1,
      createdAt: data.created_at,
    };
  }

  /**
   * List documents in a collection.
   */
  async listDocuments(request?: DocumentListRequest, options?: RequestOptions): Promise<DocumentListResponse> {
    const resolvedCollectionId = await this.resolveSingleCollectionId({
      collection: request?.collection,
      collectionId: request?.collectionId,
    });

    const { data, metadata } = await this.request<{
      data: Array<{
        id: string;
        filename: string;
        status: string;
        mime_type?: string;
        file_size_bytes?: number;
        vector_count?: number;
        chunk_count?: number;
        collection_id?: string;
        progress_percent?: number;
        progress_stage?: string;
        error_message?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    }>('GET', '/v1/documents', {
      params: {
        collection_id: resolvedCollectionId,
        limit: request?.limit,
        offset: request?.offset,
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const documents: Document[] = data.data.map((d) => ({
      id: d.id,
      filename: d.filename,
      status: d.status,
      mimeType: d.mime_type,
      sizeBytes: d.file_size_bytes,
      vectorCount: d.vector_count ?? 0,
      chunkCount: d.chunk_count ?? 0,
      collectionId: d.collection_id,
      progressPercent: d.progress_percent,
      progressStage: d.progress_stage,
      errorMessage: d.error_message,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    return {
      data: documents,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      hasMore: data.has_more,
      ...metadata,
    };
  }

  /**
   * Delete a document.
   */
  async deleteDocument(documentId: string, options?: RequestOptions): Promise<DeleteResponse> {
    const { data } = await this.request<{
      message: string;
      id: string;
      vectors_removed?: number;
    }>('DELETE', `/v1/documents/${documentId}`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      message: data.message ?? 'Document deleted',
      id: data.id ?? documentId,
    };
  }

  /**
   * Wait for a document to finish processing.
   */
  async waitForDocument(
    documentId: string,
    waitOpts?: {
      /** Maximum time to wait in milliseconds (default: 300000 = 5 minutes) */
      timeout?: number;
      /** Time between status checks in milliseconds (default: 2000) */
      pollInterval?: number;
    },
    options?: RequestOptions
  ): Promise<DocumentStatus> {
    const timeout = waitOpts?.timeout ?? 300000;
    const pollInterval = waitOpts?.pollInterval ?? 2000;
    const startTime = Date.now();

    while (true) {
      const status = await this.getDocumentStatus(documentId, options);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new RagoraError(
          `Document processing failed: ${status.progressStage ?? 'unknown error'}`,
          500,
          undefined,
          documentId
        );
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new RagoraError(
          `Timeout waiting for document ${documentId} to process`,
          408,
          undefined,
          documentId
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // --- Marketplace ---

  /**
   * List public marketplace products.
   */
  async listMarketplace(
    request?: MarketplaceListRequest,
    options?: RequestOptions
  ): Promise<MarketplaceListResponse> {
    const { data, metadata } = await this.request<{
      data: Array<{
        id: string;
        collection_id?: string;
        seller_id: string;
        slug: string;
        title: string;
        description?: string;
        thumbnail_url?: string;
        status: string;
        average_rating: number;
        review_count: number;
        total_vectors: number;
        total_chunks: number;
        access_count: number;
        data_size?: string;
        is_trending?: boolean;
        is_verified?: boolean;
        seller?: { id: string; full_name?: string; name?: string; email?: string };
        categories?: Array<{ id: string; slug: string; name: string }>;
        listings?: Array<{
          id: string;
          product_id: string;
          seller_id: string;
          type: string;
          price_amount_usd: number;
          price_interval?: string;
          price_per_retrieval_usd?: number;
          is_active: boolean;
          buyer_count?: number;
          created_at?: string;
          updated_at?: string;
        }>;
        created_at?: string;
        updated_at?: string;
      }>;
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    }>('GET', '/v1/marketplace', {
      params: {
        limit: request?.limit,
        offset: request?.offset,
        search: request?.search,
        category: request?.category,
        trending: request?.trending ? 'true' : undefined,
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const products: MarketplaceProduct[] = data.data.map((p) =>
      this.mapMarketplaceProduct(p)
    );

    return {
      data: products,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      hasMore: data.hasMore,
      ...metadata,
    };
  }

  /**
   * Get a marketplace product by ID or slug.
   */
  async getMarketplaceProduct(idOrSlug: string, options?: RequestOptions): Promise<MarketplaceProduct> {
    const { data } = await this.request<{
      id: string;
      collection_id?: string;
      seller_id: string;
      slug: string;
      title: string;
      description?: string;
      thumbnail_url?: string;
      status: string;
      average_rating: number;
      review_count: number;
      total_vectors: number;
      total_chunks: number;
      access_count: number;
      data_size?: string;
      is_trending?: boolean;
      is_verified?: boolean;
      seller?: { id: string; full_name?: string; name?: string; email?: string };
      categories?: Array<{ id: string; slug: string; name: string }>;
      listings?: Array<{
        id: string;
        product_id: string;
        seller_id: string;
        type: string;
        price_amount_usd: number;
        price_interval?: string;
        price_per_retrieval_usd?: number;
        is_active: boolean;
        buyer_count?: number;
        created_at?: string;
        updated_at?: string;
      }>;
      created_at?: string;
      updated_at?: string;
    }>('GET', `/v1/marketplace/${idOrSlug}`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return this.mapMarketplaceProduct(data);
  }

  /**
   * Map a raw marketplace product response to the SDK type.
   */
  private mapMarketplaceProduct(p: {
    id: string;
    collection_id?: string;
    seller_id: string;
    slug: string;
    title: string;
    description?: string;
    thumbnail_url?: string;
    status: string;
    average_rating: number;
    review_count: number;
    total_vectors: number;
    total_chunks: number;
    access_count: number;
    data_size?: string;
    is_trending?: boolean;
    is_verified?: boolean;
    seller?: { id: string; full_name?: string; name?: string; email?: string };
    categories?: Array<{ id: string; slug: string; name: string }>;
    listings?: Array<{
      id: string;
      product_id: string;
      seller_id: string;
      type: string;
      price_amount_usd: number;
      price_interval?: string;
      price_per_retrieval_usd?: number;
      is_active: boolean;
      buyer_count?: number;
      created_at?: string;
      updated_at?: string;
    }>;
    created_at?: string;
    updated_at?: string;
  }): MarketplaceProduct {
    const listings: Listing[] | undefined = p.listings?.map((l) => ({
      id: l.id,
      productId: l.product_id,
      sellerId: l.seller_id,
      type: l.type,
      priceAmountUsd: l.price_amount_usd,
      priceInterval: l.price_interval,
      pricePerRetrievalUsd: l.price_per_retrieval_usd,
      isActive: l.is_active,
      buyerCount: l.buyer_count,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

    return {
      id: p.id,
      collectionId: p.collection_id,
      sellerId: p.seller_id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      thumbnailUrl: p.thumbnail_url,
      status: p.status,
      averageRating: p.average_rating ?? 0,
      reviewCount: p.review_count ?? 0,
      totalVectors: p.total_vectors ?? 0,
      totalChunks: p.total_chunks ?? 0,
      accessCount: p.access_count ?? 0,
      dataSize: p.data_size,
      isTrending: p.is_trending,
      isVerified: p.is_verified,
      seller: p.seller
        ? { id: p.seller.id, name: p.seller.full_name ?? p.seller.name, email: p.seller.email }
        : undefined,
      categories: p.categories,
      listings,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  private mapAgent(raw: Record<string, unknown>): Agent {
    const memoryConfig = RagoraClient.isRecord(raw.memory_config) ? raw.memory_config : {};
    const memoryRetrievalPolicy = RagoraClient.isRecord(memoryConfig.retrieval_policy)
      ? (memoryConfig.retrieval_policy as Record<string, unknown>)
      : undefined;
    const topLevelRetrievalPolicy = RagoraClient.isRecord(raw.retrieval_policy)
      ? (raw.retrieval_policy as Record<string, unknown>)
      : undefined;

    return {
      id: String(raw.id ?? ''),
      orgId: String(raw.org_id ?? ''),
      name: String(raw.name ?? ''),
      type: String(raw.type ?? 'support'),
      systemPrompt: String(raw.system_prompt ?? ''),
      collectionIds: Array.isArray(raw.collection_ids) ? raw.collection_ids.map(String) : [],
      memoryConfig,
      retrievalPolicy: topLevelRetrievalPolicy ?? memoryRetrievalPolicy,
      budgetConfig: RagoraClient.isRecord(raw.budget_config) ? raw.budget_config : {},
      status: String(raw.status ?? 'active'),
      createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
      updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    };
  }

  private mapAgentSession(raw: Record<string, unknown>): AgentSession {
    return {
      id: String(raw.id ?? ''),
      agentId: String(raw.agent_id ?? ''),
      orgId: String(raw.org_id ?? ''),
      source: String(raw.source ?? ''),
      sourceKey: typeof raw.source_key === 'string' ? raw.source_key : undefined,
      visitorId: typeof raw.visitor_id === 'string' ? raw.visitor_id : undefined,
      status: String(raw.status ?? 'open'),
      messageCount: typeof raw.message_count === 'number' ? raw.message_count : 0,
      createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
      updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    };
  }

  // --- Agents ---

  /**
   * Create a new agent.
   */
  async createAgent(request: CreateAgentRequest, options?: RequestOptions): Promise<Agent> {
    const { data } = await this.request<Record<string, unknown>>('POST', '/v1/agents', {
      body: {
        name: request.name,
        ...(request.type && { type: request.type }),
        ...(request.systemPrompt && { system_prompt: request.systemPrompt }),
        collection_ids: request.collectionIds,
        ...(request.memoryConfig && { memory_config: request.memoryConfig }),
        ...(request.retrievalPolicy && { retrieval_policy: request.retrievalPolicy }),
        ...(request.budgetConfig && { budget_config: request.budgetConfig }),
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });
    return this.mapAgent(data);
  }

  /**
   * List all agents.
   */
  async listAgents(options?: RequestOptions): Promise<AgentListResponse> {
    const { data, metadata } = await this.request<{ agents: Record<string, unknown>[] }>(
      'GET', '/v1/agents', {
        requestId: options?.requestId,
        timeout: options?.timeout,
      }
    );
    return {
      agents: (data.agents ?? []).map((a) => this.mapAgent(a)),
      ...metadata,
    };
  }

  /**
   * Get an agent by ID.
   */
  async getAgent(agentId: string, options?: RequestOptions): Promise<Agent> {
    const { data } = await this.request<Record<string, unknown>>(
      'GET', `/v1/agents/${agentId}`, {
        requestId: options?.requestId,
        timeout: options?.timeout,
      }
    );
    return this.mapAgent(data);
  }

  /**
   * Update an agent.
   */
  async updateAgent(agentId: string, request: UpdateAgentRequest, options?: RequestOptions): Promise<Agent> {
    const body: Record<string, unknown> = {};
    if (request.name !== undefined) body.name = request.name;
    if (request.systemPrompt !== undefined) body.system_prompt = request.systemPrompt;
    if (request.collectionIds !== undefined) body.collection_ids = request.collectionIds;
    if (request.memoryConfig !== undefined) body.memory_config = request.memoryConfig;
    if (request.retrievalPolicy !== undefined) body.retrieval_policy = request.retrievalPolicy;
    if (request.budgetConfig !== undefined) body.budget_config = request.budgetConfig;
    if (request.status !== undefined) body.status = request.status;

    const { data } = await this.request<Record<string, unknown>>(
      'PATCH', `/v1/agents/${agentId}`, {
        body,
        requestId: options?.requestId,
        timeout: options?.timeout,
      }
    );
    return this.mapAgent(data);
  }

  /**
   * Delete an agent.
   */
  async deleteAgent(agentId: string, options?: RequestOptions): Promise<DeleteResponse> {
    const { data } = await this.request<{ message: string; id?: string }>(
      'DELETE', `/v1/agents/${agentId}`, {
        requestId: options?.requestId,
        timeout: options?.timeout,
      }
    );
    return {
      message: data.message ?? 'Agent deleted',
      id: data.id ?? agentId,
    };
  }

  /**
   * Chat with an agent.
   */
  async agentChat(agentId: string, request: AgentChatRequest, options?: RequestOptions): Promise<AgentChatResponse> {
    const { data, metadata } = await this.request<{
      message: string;
      session_id: string;
      citations: unknown[];
      stats?: Record<string, unknown>;
    }>('POST', `/v1/agents/${agentId}/chat`, {
      body: {
        message: request.message,
        ...(request.sessionId && { session_id: request.sessionId }),
        ...(request.collectionIds && { collection_ids: request.collectionIds }),
        stream: false,
      },
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      message: data.message,
      sessionId: data.session_id,
      citations: data.citations ?? [],
      stats: data.stats,
      ...metadata,
    };
  }

  /**
   * Stream a chat with an agent.
   */
  async *agentChatStream(
    agentId: string,
    request: AgentChatRequest,
    options?: RequestOptions
  ): AsyncGenerator<AgentChatStreamChunk> {
    const url = `${this.baseUrl}/v1/agents/${agentId}/chat`;
    const effectiveTimeout = options?.timeout ?? this.timeout;

    const controller = new AbortController();
    // Use an inactivity timeout that resets on each chunk, not a fixed wall-clock timeout
    let timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    };

    this.log(`Request: POST /v1/agents/${agentId}/chat (stream)`);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          ...(options?.requestId && { 'X-Request-ID': options.requestId }),
        },
        body: JSON.stringify({
          message: request.message,
          ...(request.sessionId && { session_id: request.sessionId }),
          ...(request.collectionIds && { collection_ids: request.collectionIds }),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const metadata = this.extractMetadata(response.headers);
        await this.handleError(response, metadata.requestId);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines: string[] = [];
      let sessionId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetTimeout();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();

          if (!line) {
            // Process event
            if (dataLines.length > 0) {
              const dataStr = dataLines.join('\n');
              dataLines = [];

              if (dataStr === '[DONE]') {
                eventName = 'message';
                return;
              }

              try {
                const parsed = JSON.parse(dataStr) as Record<string, unknown>;

                if (eventName === 'ragora_status') {
                  // Extract session ID if present
                  if (RagoraClient.isRecord(parsed.ragora_stats)) {
                    const rstats = parsed.ragora_stats as Record<string, unknown>;
                    if (typeof rstats.conversation_id === 'string') {
                      sessionId = rstats.conversation_id;
                    }
                  }
                  // Yield thinking step
                  const stepType =
                    typeof parsed.type === 'string' ? parsed.type : 'working';
                  const stepMessage =
                    typeof parsed.status === 'string'
                      ? parsed.status
                      : typeof parsed.message === 'string'
                        ? parsed.message
                        : 'Working...';
                  yield {
                    content: '',
                    sessionId,
                    sources: [],
                    thinking: {
                      type: stepType,
                      message: stepMessage,
                      timestamp: Date.now(),
                    },
                    done: false,
                  };
                } else if (eventName === 'ragora_metadata') {
                  if (RagoraClient.isRecord(parsed.ragora_stats)) {
                    const rstats = parsed.ragora_stats as Record<string, unknown>;
                    if (typeof rstats.conversation_id === 'string') {
                      sessionId = rstats.conversation_id;
                    }
                  }
                } else if (eventName === 'ragora_complete') {
                  const stats = RagoraClient.isRecord(parsed.ragora_stats)
                    ? (parsed.ragora_stats as Record<string, unknown>)
                    : undefined;
                  const sources = this.extractChatSources(parsed);
                  yield { content: '', sessionId, sources, stats, done: true };
                } else {
                  // Content chunk
                  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
                  const firstChoice =
                    choices.length > 0 && RagoraClient.isRecord(choices[0]) ? choices[0] : {};
                  const delta = RagoraClient.isRecord(firstChoice.delta)
                    ? firstChoice.delta
                    : {};
                  const content = typeof delta.content === 'string' ? delta.content : '';
                  if (content) {
                    yield { content, sessionId, sources: [], done: false };
                  }
                }
              } catch {
                // skip malformed JSON
              }
            }
            eventName = 'message';
            continue;
          }

          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || 'message';
            continue;
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List sessions for an agent.
   */
  async listAgentSessions(agentId: string, options?: RequestOptions): Promise<AgentSessionListResponse> {
    const { data, metadata } = await this.request<{
      sessions: Record<string, unknown>[];
      total: number;
    }>('GET', `/v1/agents/${agentId}/sessions`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    return {
      sessions: (data.sessions ?? []).map((s) => this.mapAgentSession(s)),
      total: data.total ?? 0,
      ...metadata,
    };
  }

  /**
   * Get an agent session with its messages.
   */
  async getAgentSession(
    agentId: string,
    sessionId: string,
    options?: RequestOptions
  ): Promise<AgentSessionDetailResponse> {
    const { data, metadata } = await this.request<{
      session: Record<string, unknown>;
      messages: Record<string, unknown>[];
    }>('GET', `/v1/agents/${agentId}/sessions/${sessionId}`, {
      requestId: options?.requestId,
      timeout: options?.timeout,
    });

    const messages: AgentMessage[] = (data.messages ?? []).map((m) => ({
      id: String(m.id ?? ''),
      sessionId: String(m.session_id ?? ''),
      role: String(m.role ?? ''),
      content: String(m.content ?? ''),
      latencyMs: typeof m.latency_ms === 'number' ? m.latency_ms : undefined,
      costUsd: typeof m.cost_usd === 'number' ? m.cost_usd : undefined,
      model: typeof m.model === 'string' ? m.model : undefined,
      createdAt: typeof m.created_at === 'string' ? m.created_at : undefined,
    }));

    return {
      session: this.mapAgentSession(data.session ?? {}),
      messages,
      ...metadata,
    };
  }

  /**
   * Delete/resolve an agent session and clean up its memory.
   */
  async deleteAgentSession(
    agentId: string,
    sessionId: string,
    options?: RequestOptions
  ): Promise<DeleteResponse> {
    const { data } = await this.request<{ status: string }>(
      'DELETE', `/v1/agents/${agentId}/sessions/${sessionId}`, {
        requestId: options?.requestId,
        timeout: options?.timeout,
      }
    );
    return {
      message: data.status ?? 'resolved',
      id: sessionId,
    };
  }

  // --- Auto-Pagination Iterators ---

  /**
   * Iterate over all collections, automatically handling pagination.
   */
  async *listCollectionsIter(
    request?: Omit<CollectionListRequest, 'offset'>,
    options?: RequestOptions
  ): AsyncGenerator<Collection> {
    const limit = request?.limit ?? 20;
    let offset = 0;
    while (true) {
      const page = await this.listCollections(
        { ...request, limit, offset },
        options
      );
      for (const item of page.data) {
        yield item;
      }
      if (!page.hasMore) break;
      offset += page.limit;
    }
  }

  /**
   * Iterate over all documents, automatically handling pagination.
   */
  async *listDocumentsIter(
    request?: Omit<DocumentListRequest, 'offset'>,
    options?: RequestOptions
  ): AsyncGenerator<Document> {
    const limit = request?.limit ?? 50;
    let offset = 0;
    while (true) {
      const page = await this.listDocuments(
        { ...request, limit, offset },
        options
      );
      for (const item of page.data) {
        yield item;
      }
      if (!page.hasMore) break;
      offset += page.limit;
    }
  }

  /**
   * Iterate over all marketplace products, automatically handling pagination.
   */
  async *listMarketplaceIter(
    request?: Omit<MarketplaceListRequest, 'offset'>,
    options?: RequestOptions
  ): AsyncGenerator<MarketplaceProduct> {
    const limit = request?.limit ?? 20;
    let offset = 0;
    while (true) {
      const page = await this.listMarketplace(
        { ...request, limit, offset },
        options
      );
      for (const item of page.data) {
        yield item;
      }
      if (!page.hasMore) break;
      offset += page.limit;
    }
  }
}
