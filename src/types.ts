/**
 * TypeScript types for Ragora API responses.
 */

// --- Response Metadata ---

export interface ResponseMetadata {
  /** Unique request identifier */
  requestId?: string;
  /** API version */
  apiVersion?: string;
  /** Cost of this request in USD */
  costUsd?: number;
  /** Remaining balance in USD */
  balanceRemainingUsd?: number;
  /** Rate limit per window */
  rateLimitLimit?: number;
  /** Remaining requests in window */
  rateLimitRemaining?: number;
  /** Seconds until rate limit resets */
  rateLimitReset?: number;
}

// --- Search Types ---

export interface SearchRequest {
  /** Collection ID or slug (single or array). Omit to search all accessible collections. */
  collectionId?: string | string[];
  /** Search query */
  query: string;
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum relevance score (0-1) */
  threshold?: number;
  /** Metadata filters (MongoDB-style operators: $gt, $gte, $lt, $lte, $in, $ne) */
  filters?: Record<string, unknown>;
  /** Filter by source type (e.g., ["upload", "html", "youtube"]) */
  sourceType?: string[];
  /** Filter by source name */
  sourceName?: string[];
  /** Filter by document version tags */
  version?: string[];
  /** Version mode: "latest" or "all" */
  versionMode?: string;
  /** Filter by specific document keys */
  documentKeys?: string[];
  /** Filter by custom tags (OR logic) */
  customTags?: string[];
  /** Filter by domain (e.g., ["legal", "medical", "software_docs"]) */
  domain?: string[];
  /** Domain filter mode: "preferred" (boost, default) or "strict" (filter) */
  domainFilterMode?: string;
  /** Toggle reranker for result refinement (default: false) */
  enableReranker?: boolean;
  /** Knowledge graph filter for entity-based pre-filtering */
  graphFilter?: {
    /** Entity names to filter by (AND logic) */
    entities?: string[];
    /** Entity type to restrict (e.g., "PERSON", "ORG", "api_function") */
    entityType?: string;
  };
  /** Temporal filter for time-based result weighting */
  temporalFilter?: {
    /** Point-in-time snapshot */
    asOf?: string;
    /** Start of time range */
    since?: string;
    /** End of time range */
    until?: string;
    /** Recency weight (0-1) */
    recencyWeight?: number;
    /** Decay function: "exponential" or "linear" */
    recencyDecay?: string;
    /** Half-life in days for decay */
    decayHalfLife?: number;
  };
}

export interface SearchResult {
  /** Document chunk ID */
  id: string;
  /** Document content */
  content: string;
  /** Relevance score (0-1) */
  score: number;
  /** Document metadata */
  metadata: Record<string, unknown>;
  /** Parent document ID */
  documentId?: string;
  /** Collection ID */
  collectionId?: string;
}

export interface SearchResponse extends ResponseMetadata {
  /** Response object type */
  object?: string;
  /** Search results */
  results: SearchResult[];
  /** Agent-native retrieval fragments */
  fragments?: Array<Record<string, unknown>>;
  /** Suggested citation instruction for downstream prompts */
  systemInstruction?: string;
  /** Cross-chunk graph context */
  knowledgeGraph?: Record<string, unknown>;
  /** Backward-compatible graph context alias */
  globalGraphContext?: Record<string, unknown>;
  /** Human-readable graph summary */
  knowledgeGraphSummary?: string;
  /** Graph enrichment debug metadata */
  graphDebug?: Record<string, unknown>;
  /** Original query */
  query: string;
  /** Total matching results */
  total: number;
}

// --- Chat Types ---

export interface ChatMessage {
  /** Message role: 'user', 'assistant', or 'system' */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
}

export interface ChatRequest {
  /** Collection ID or slug (single or array). Omit to use all accessible collections. */
  collectionId?: string | string[];
  /** Product IDs to search */
  productIds?: string[];
  /** Chat messages */
  messages: ChatMessage[];
  /** Model to use via OpenRouter (e.g., "openai/gpt-4o-mini", "anthropic/claude-4-5-sonnet") */
  model?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Number of chunks to retrieve for context (default: 5, max: 20) */
  topK?: number;
  /** Filter by source type */
  sourceType?: string[];
  /** Filter by source name */
  sourceName?: string[];
  /** Filter by document version */
  version?: string[];
  /** Filter by custom tags */
  customTags?: string[];
  /** Metadata filters (MongoDB-style operators) */
  filters?: Record<string, unknown>;
  /** Toggle reranker for result refinement (default: false) */
  enableReranker?: boolean;
  /** Request metadata for analytics tracking */
  metadata?: {
    /** Request source: "web", "api", "discord_bot", "slack_bot" */
    source?: string;
    /** Bot installation ID */
    installationId?: string;
    /** Chat channel ID */
    channelId?: string;
    /** User who triggered the request */
    requesterId?: string;
  };
}

export interface ChatChoice {
  /** Choice index */
  index: number;
  /** Generated message */
  message: ChatMessage;
  /** Why generation stopped */
  finishReason?: string;
}

export interface ChatUsage {
  /** Prompt tokens used */
  promptTokens: number;
  /** Completion tokens generated */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
}

export interface ChatResponse extends ResponseMetadata {
  /** Completion ID */
  id: string;
  /** Object type */
  object: string;
  /** Unix timestamp */
  created: number;
  /** Model used */
  model: string;
  /** Completion choices */
  choices: ChatChoice[];
  /** Token usage */
  usage?: ChatUsage;
  /** Source documents used for RAG (flattened from ragora_stats.sources) */
  sources: SearchResult[];
}

export interface ChatStreamChunk {
  /** Content delta */
  content: string;
  /** Why generation stopped */
  finishReason?: string;
  /** Sources from Ragora SSE metadata events */
  sources: SearchResult[];
}

// --- Credit Types ---

export interface CreditBalance extends ResponseMetadata {
  /** Current balance in USD */
  balanceUsd: number;
  /** Currency code */
  currency: string;
}

// --- Collection Types ---

export interface Collection {
  /** Collection ID */
  id: string;
  /** Owner user ID */
  ownerId?: string;
  /** Collection name */
  name: string;
  /** URL-friendly slug */
  slug?: string;
  /** Collection description */
  description?: string;
  /** Number of documents */
  totalDocuments: number;
  /** Number of vectors */
  totalVectors: number;
  /** Number of chunks */
  totalChunks: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface CollectionListRequest {
  /** Number of results per page (max 100) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Optional search query */
  search?: string;
}

export interface CollectionListResponse extends ResponseMetadata {
  /** Collections */
  data: Collection[];
  /** Total count */
  total: number;
  /** Page size */
  limit: number;
  /** Page offset */
  offset: number;
  /** More pages available */
  hasMore: boolean;
}

// --- Collection Mutation Types ---

export interface CreateCollectionRequest {
  /** Collection name */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional URL-friendly slug */
  slug?: string;
}

export interface UpdateCollectionRequest {
  /** New name (optional) */
  name?: string;
  /** New description (optional) */
  description?: string;
  /** New slug (optional) */
  slug?: string;
  /** MCP tool configuration (JSON) */
  capabilityConfig?: Record<string, unknown>;
}

// --- Document Types ---

export interface Document {
  /** Document ID */
  id: string;
  /** Original filename */
  filename: string;
  /** Processing status: pending, uploading, processing, retrying, completed, failed, unsupported */
  status: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Number of vectors generated */
  vectorCount: number;
  /** Number of chunks generated */
  chunkCount: number;
  /** Parent collection ID */
  collectionId?: string;
  /** Processing progress (0-100) */
  progressPercent?: number;
  /** Current processing stage */
  progressStage?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface DocumentStatus {
  /** Document ID */
  id: string;
  /** Processing status */
  status: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType?: string;
  /** Number of vectors generated */
  vectorCount: number;
  /** Number of chunks generated */
  chunkCount: number;
  /** Processing progress (0-100) */
  progressPercent?: number;
  /** Current processing stage */
  progressStage?: string;
  /** Estimated time remaining in seconds */
  etaSeconds?: number;
  /** Whether transcript is available */
  hasTranscript: boolean;
  /** Whether this is the active version */
  isActive: boolean;
  /** Version number */
  versionNumber: number;
  /** Creation timestamp */
  createdAt?: string;
}

export interface DocumentListRequest {
  /** Collection ID or slug (lists all if not provided) */
  collectionId?: string;
  /** Number of results per page (max 200) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface DocumentListResponse extends ResponseMetadata {
  /** Documents */
  data: Document[];
  /** Total count */
  total: number;
  /** Page size */
  limit: number;
  /** Page offset */
  offset: number;
  /** More pages available */
  hasMore: boolean;
}

export interface UploadDocumentRequest {
  /** File content */
  file: Blob | Buffer;
  /** Original filename */
  filename: string;
  /** Target collection ID or slug (uses default if not provided) */
  collectionId?: string;
}

export interface UploadResponse extends ResponseMetadata {
  /** Document ID */
  id: string;
  /** Original filename */
  filename: string;
  /** Initial status (usually 'pending') */
  status: string;
  /** Collection the document was uploaded to */
  collectionId: string;
  /** Status message */
  message?: string;
}

export interface DeleteResponse {
  /** Status message */
  message: string;
  /** Deleted resource ID */
  id: string;
  /** Deletion timestamp */
  deletedAt?: string;
}

// --- Marketplace Types ---

export interface Listing {
  /** Listing ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Seller ID */
  sellerId: string;
  /** Pricing type: subscription, one_time, usage_based, free */
  type: string;
  /** Price in USD */
  priceAmountUsd: number;
  /** Billing interval: month, year, or null for one_time */
  priceInterval?: string;
  /** Per-retrieval price in USD (usage_based only) */
  pricePerRetrievalUsd?: number;
  /** Whether this listing is active */
  isActive: boolean;
  /** Number of buyers */
  buyerCount?: number;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface MarketplaceProduct {
  /** Product ID */
  id: string;
  /** Linked collection ID */
  collectionId?: string;
  /** Seller user ID */
  sellerId: string;
  /** URL-friendly slug */
  slug: string;
  /** Product title */
  title: string;
  /** Product description */
  description?: string;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /** Product status: draft, active, archived */
  status: string;
  /** Average user rating */
  averageRating: number;
  /** Number of reviews */
  reviewCount: number;
  /** Total vectors in the product */
  totalVectors: number;
  /** Total chunks in the product */
  totalChunks: number;
  /** Number of users with access */
  accessCount: number;
  /** Human-readable data size */
  dataSize?: string;
  /** Whether the product is trending */
  isTrending?: boolean;
  /** Whether the product is verified */
  isVerified?: boolean;
  /** Seller info (included in detail response) */
  seller?: { id: string; name?: string; email?: string };
  /** Product categories */
  categories?: { id: string; slug: string; name: string }[];
  /** Product listings (pricing options) */
  listings?: Listing[];
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface MarketplaceListRequest {
  /** Number of results per page (max 100) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Search query */
  search?: string;
  /** Filter by category */
  category?: string;
  /** Show trending products first */
  trending?: boolean;
}

export interface MarketplaceListResponse extends ResponseMetadata {
  /** Marketplace products */
  data: MarketplaceProduct[];
  /** Total count */
  total: number;
  /** Page size */
  limit: number;
  /** Page offset */
  offset: number;
  /** More pages available */
  hasMore: boolean;
}

// --- Error Types ---

export interface APIErrorDetail {
  /** Field that caused the error */
  field?: string;
  /** Specific reason */
  reason?: string;
}

export interface APIError {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details: APIErrorDetail[];
  /** Request ID for debugging */
  requestId?: string;
}
