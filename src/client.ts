/**
 * Ragora API Client
 *
 * Fetch-based HTTP client for the Ragora API.
 */

import { RagoraError } from './errors.js';
import type {
  APIError,
  ChatChoice,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  Collection,
  CollectionListRequest,
  CollectionListResponse,
  CreateCollectionRequest,
  CreditBalance,
  DeleteResponse,
  Document,
  DocumentListRequest,
  DocumentListResponse,
  DocumentStatus,
  Listing,
  MarketplaceListRequest,
  MarketplaceListResponse,
  MarketplaceProduct,
  ResponseMetadata,
  SearchRequest,
  SearchResponse,
  SearchResult,
  UpdateCollectionRequest,
  UploadDocumentRequest,
  UploadResponse,
} from './types.js';

export interface RagoraClientOptions {
  /** Your Ragora API key */
  apiKey: string;
  /** API base URL (default: https://api.ragora.app) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom fetch implementation (for testing or environments without global fetch) */
  fetch?: typeof fetch;
}

export class RagoraClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: RagoraClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.ragora.app').replace(
      /\/$/,
      ''
    );
    this.timeout = options.timeout ?? 30000;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
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
   * Make an API request.
   */
  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | undefined>;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ragora-js/0.1.0',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const metadata = this.extractMetadata(response.headers);

      if (!response.ok) {
        await this.handleError(response, metadata.requestId);
      }

      const data = (await response.json()) as T;
      return { data, metadata };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle error responses.
   */
  private async handleError(
    response: Response,
    requestId?: string
  ): Promise<never> {
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
          throw new RagoraError(
            error.message,
            response.status,
            error,
            requestId
          );
        }
        throw new RagoraError(
          String(errorData),
          response.status,
          undefined,
          requestId
        );
      }

      throw new RagoraError(
        String(data.message ?? response.statusText),
        response.status,
        undefined,
        requestId
      );
    } catch (e) {
      if (e instanceof RagoraError) throw e;

      throw new RagoraError(
        response.statusText || `HTTP ${response.status}`,
        response.status,
        undefined,
        requestId
      );
    }
  }

  // --- Search ---

  /**
   * Search for relevant documents in a collection.
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const collectionIds = request.collectionId
      ? Array.isArray(request.collectionId)
        ? request.collectionId
        : [request.collectionId]
      : undefined;

    const { data, metadata } = await this.request<{
      results: Array<{
        id: string;
        text?: string;
        content?: string;
        score: number;
        metadata?: Record<string, unknown>;
        document_id?: string;
        collection_id?: string;
      }>;
    }>('POST', '/v1/retrieve', {
      body: {
        ...(collectionIds && { collection_ids: collectionIds }),
        query: request.query,
        top_k: request.topK ?? 5,
        filters: request.filters,
      },
    });

    const results: SearchResult[] = data.results.map((r) => ({
      id: r.id,
      content: r.text ?? r.content ?? '',
      score: r.score,
      metadata: r.metadata ?? {},
      documentId: r.document_id,
      collectionId: r.collection_id,
    }));

    return {
      results,
      query: request.query,
      total: results.length,
      ...metadata,
    };
  }

  // --- Chat ---

  /**
   * Generate a chat completion with RAG context.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const collectionIds = request.collectionId
      ? Array.isArray(request.collectionId)
        ? request.collectionId
        : [request.collectionId]
      : undefined;

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
      sources?: Array<{
        id: string;
        content: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>('POST', '/v1/chat/completions', {
      body: {
        ...(collectionIds && { collection_ids: collectionIds }),
        messages: request.messages,
        model: request.model ?? 'gpt-4o-mini',
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        top_k: request.topK,
        stream: false,
      },
    });

    const choices: ChatChoice[] = data.choices.map((c) => ({
      index: c.index,
      message: {
        role: c.message.role as 'user' | 'assistant' | 'system',
        content: c.message.content,
      },
      finishReason: c.finish_reason,
    }));

    const sources: SearchResult[] = (data.sources ?? []).map((s) => ({
      id: s.id,
      content: s.content,
      score: s.score,
      metadata: s.metadata ?? {},
    }));

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
      ...metadata,
    };
  }

  /**
   * Stream a chat completion with RAG context.
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const collectionIds = request.collectionId
      ? Array.isArray(request.collectionId)
        ? request.collectionId
        : [request.collectionId]
      : undefined;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ragora-js/0.1.0',
        },
        body: JSON.stringify({
          ...(collectionIds && { collection_ids: collectionIds }),
          messages: request.messages,
          model: request.model ?? 'gpt-4o-mini',
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          top_k: request.topK,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const dataStr = line.slice(6); // Remove "data: " prefix
          if (dataStr === '[DONE]') return;

          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string;
              }>;
              sources?: Array<{
                id: string;
                content: string;
                score: number;
                metadata?: Record<string, unknown>;
              }>;
            };

            const delta = data.choices?.[0]?.delta ?? {};
            const finishReason = data.choices?.[0]?.finish_reason;

            const sources: SearchResult[] = (data.sources ?? []).map((s) => ({
              id: s.id,
              content: s.content,
              score: s.score,
              metadata: s.metadata ?? {},
            }));

            yield {
              content: delta.content ?? '',
              finishReason,
              sources,
            };
          } catch {
            // Skip invalid JSON lines
            continue;
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
  async getBalance(): Promise<CreditBalance> {
    const { data, metadata } = await this.request<{
      balance_usd: number;
      currency?: string;
    }>('GET', '/v1/credits/balance');

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
    request?: CollectionListRequest
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
  async getCollection(collectionId: string): Promise<Collection> {
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
    }>('GET', `/v1/collections/${collectionId}`);

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
  async createCollection(request: CreateCollectionRequest): Promise<Collection> {
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
    request: UpdateCollectionRequest
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
      },
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
  async deleteCollection(collectionId: string): Promise<DeleteResponse> {
    const { data } = await this.request<{
      message: string;
      id: string;
      deleted_at?: string;
    }>('DELETE', `/v1/collections/${collectionId}`);

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
  async uploadDocument(request: UploadDocumentRequest): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', request.file, request.filename);
    if (request.collectionId) {
      formData.append('collection_id', request.collectionId);
    }

    const url = `${this.baseUrl}/v1/documents`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'ragora-js/0.1.0',
          // Note: Don't set Content-Type for FormData - browser sets it with boundary
        },
        body: formData,
        signal: controller.signal,
      });

      const metadata = this.extractMetadata(response.headers);

      if (!response.ok) {
        await this.handleError(response, metadata.requestId);
      }

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
        collectionId: data.collection_id ?? request.collectionId ?? '',
        message: data.message,
        ...metadata,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the processing status of a document.
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatus> {
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
    }>('GET', `/v1/documents/${documentId}/status`);

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
  async listDocuments(request?: DocumentListRequest): Promise<DocumentListResponse> {
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
        collection_id: request?.collectionId,
        limit: request?.limit,
        offset: request?.offset,
      },
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
  async deleteDocument(documentId: string): Promise<DeleteResponse> {
    const { data } = await this.request<{
      message: string;
      id: string;
      vectors_removed?: number;
    }>('DELETE', `/v1/documents/${documentId}`);

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
    options?: {
      /** Maximum time to wait in milliseconds (default: 300000 = 5 minutes) */
      timeout?: number;
      /** Time between status checks in milliseconds (default: 2000) */
      pollInterval?: number;
    }
  ): Promise<DocumentStatus> {
    const timeout = options?.timeout ?? 300000;
    const pollInterval = options?.pollInterval ?? 2000;
    const startTime = Date.now();

    while (true) {
      const status = await this.getDocumentStatus(documentId);

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
    request?: MarketplaceListRequest
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
  async getMarketplaceProduct(idOrSlug: string): Promise<MarketplaceProduct> {
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
    }>('GET', `/v1/marketplace/${idOrSlug}`);

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
}
