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

export interface RetrievalGraphFilter {
  /** Entity names to filter by (AND logic) */
  entities?: string[];
  /** Entity type to restrict (e.g., "PERSON", "ORG", "api_function") */
  entityType?: string;
  /** Find versions of this file ID */
  versionOf?: string;
  /** Filter by relationship type (SUPERSEDES, CITES, etc.) */
  relationType?: string;
  /** Specific file IDs to search within */
  fileIds?: string[];
  /** Graph prefilter mode: "strict" or "fallback" */
  mode?: string;
}

export interface RetrievalTemporalFilter {
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
}

export interface RetrievalOptions {
  /** Number of chunks to retrieve for context (default: 5) */
  topK?: number;
  /** Metadata filters (MongoDB-style operators: $gt, $gte, $lt, $lte, $in, $ne) */
  filters?: Record<string, unknown>;
  /** Filter by source type (e.g., ["upload", "html", "youtube"]) */
  sourceType?: string[];
  /** Filter by source name */
  sourceName?: string[];
  /** Filter by document version tags */
  version?: string[];
  /** Version mode: "latest", "all", or "exact" */
  versionMode?: string;
  /** Filter by specific document keys */
  documentKeys?: string[];
  /** Filter by custom tags (OR logic) */
  customTags?: string[];
  /** Filter by domain (e.g., ["legal", "medical", "financial"]) */
  domain?: string[];
  /** Domain filter mode: "preferred" (boost, default) or "strict" (filter) */
  domainFilterMode?: string;
  /** Toggle reranker for result refinement */
  enableReranker?: boolean;
  /** Knowledge graph filter for entity-based pre-filtering */
  graphFilter?: RetrievalGraphFilter;
  /** Temporal filter for time-based result weighting */
  temporalFilter?: RetrievalTemporalFilter;
}

export interface SearchRequest extends RetrievalOptions {
  /** Collection UUID/slug/name (single or array). Omit to search all accessible collections. */
  collection?: string | string[];
  /** Collection IDs/slugs (single or array). Legacy parameter. */
  collectionId?: string | string[];
  /** Search query */
  query: string;
}

export interface SearchResult {
  /** Document chunk ID */
  id: string;
  /** Document content */
  content: string;
  /** Relevance score (0-1) */
  score: number;
  /** Source URL (primary source link when available, e.g. web page URL, GitHub file URL) */
  sourceUrl?: string;
  /** Document metadata */
  metadata: Record<string, unknown>;
  /** Parent document ID */
  documentId?: string;
  /** Collection ID */
  collectionId?: string;
  /** Page number in source document */
  pageNumber?: number;
  /** Section heading for the chunk */
  sectionHeading?: string;
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

export interface ChatGenerationOptions {
  /** Model to use via OpenRouter (e.g., "google/gemini-2.5-flash", "anthropic/claude-4-5-sonnet") */
  model?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

export interface ChatRetrievalOptions extends RetrievalOptions {
  /** Collection UUID/slug/name (single or array). */
  collection?: string | string[];
  /** Collection IDs/slugs (single or array). Legacy parameter. */
  collectionId?: string | string[];
  /** Product UUID/slug/title (single or array). */
  products?: string | string[];
  /** Product IDs to search. Legacy parameter. */
  productIds?: string[];
}

export interface ChatAgenticOptions {
  /** Chat mode: "simple" (default) uses single retrieval, "agentic" uses multi-step agent */
  mode?: 'simple' | 'agentic';
  /** System prompt override (used with agentic mode) */
  systemPrompt?: string;
  /** Whether to enable stateful session memory. Defaults to false. */
  session?: boolean;
  /** Session ID for multi-turn agentic chat. Reuse to continue a conversation. */
  sessionId?: string;
}

export interface ChatMetadataOptions {
  /** Request source: "web", "api", "discord_bot", "slack_bot" */
  source?: string;
  /** Bot installation ID */
  installationId?: string;
  /** Chat channel ID */
  channelId?: string;
  /** User who triggered the request */
  requesterId?: string;
}

export interface ChatRequest {
  /** Chat messages */
  messages: ChatMessage[];
  /** Generation options */
  generation?: ChatGenerationOptions;
  /** Retrieval options */
  retrieval?: ChatRetrievalOptions;
  /** Agentic/session options */
  agentic?: ChatAgenticOptions;
  /** Request metadata for analytics tracking */
  metadata?: ChatMetadataOptions;
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

export interface RagoraCitation {
  /** Reference number (1-indexed) */
  ref: number;
  /** Citation text snippet */
  text?: string;
  /** Source filename or URL */
  source?: string;
  /** Relevance score */
  score?: number;
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
  /** Ragora-specific metadata (present in agentic mode) */
  ragora?: {
    /** Structured citations from agent retrieval */
    citations: RagoraCitation[];
    /** Session ID for multi-turn agentic chat */
    sessionId?: string;
  };
}

/** A real-time status update emitted while the agent is working. */
export interface ThinkingStep {
  /** Step category: "thinking", "searching", "found", "generating", "working", "warning" */
  type: string;
  /** Human-readable description of what the agent is doing */
  message: string;
  /** Unix-ms timestamp */
  timestamp: number;
}

export interface ChatStreamChunk {
  /** Content delta */
  content: string;
  /** Why generation stopped */
  finishReason?: string;
  /** Session ID for stateful chat streams */
  sessionId?: string;
  /** Sources from Ragora SSE metadata events */
  sources: SearchResult[];
  /** Final stats payload (present on ragora_complete) */
  stats?: Record<string, unknown>;
  /** Thinking step (present when the agent emits a status update) */
  thinking?: ThinkingStep;
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
  /** Collection UUID/slug/name */
  collection?: string;
  /** Collection ID or slug (legacy parameter) */
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
  /** Target collection UUID/slug/name */
  collection?: string;
  /** Target collection ID or slug (legacy parameter) */
  collectionId?: string;
  /** Relative path for directory-style uploads */
  relativePath?: string;
  /** Release tag for versioned documents */
  releaseTag?: string;
  /** Document version string */
  version?: string;
  /** When the document becomes effective (ISO 8601) */
  effectiveAt?: string;
  /** Document timestamp for temporal search (ISO 8601) */
  documentTime?: string;
  /** When the document expires (ISO 8601) */
  expiresAt?: string;
  /** Source type (e.g., "sec_filing", "web_crawl") */
  sourceType?: string;
  /** Source name (e.g., "sec-edgar") */
  sourceName?: string;
  /** Custom tags for filtering (JSON-encoded in FormData) */
  customTags?: string[];
  /** Content domain (e.g., "legal", "medical", "financial") */
  domain?: string;
  /** Scan mode for PDFs: "fast" or "hi_res" */
  scanMode?: string;
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

// --- Agent Types ---

export interface Agent {
  /** Agent ID */
  id: string;
  /** Organization ID */
  orgId: string;
  /** Agent name */
  name: string;
  /** Agent type (e.g. "support") */
  type: string;
  /** System prompt */
  systemPrompt: string;
  /** Linked collection IDs */
  collectionIds: string[];
  /** Memory configuration */
  memoryConfig: Record<string, unknown>;
  /** Retrieval policy used by agent auto-retrieval */
  retrievalPolicy?: Record<string, unknown>;
  /** Budget configuration */
  budgetConfig: Record<string, unknown>;
  /** Agent status */
  status: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface CreateAgentRequest {
  /** Agent name */
  name: string;
  /** Agent type (default: "support") */
  type?: string;
  /** System prompt */
  systemPrompt?: string;
  /** Collection IDs to link */
  collectionIds: string[];
  /** Memory configuration */
  memoryConfig?: Record<string, unknown>;
  /** Auto-retrieval policy constraints/defaults for agent tool calls */
  retrievalPolicy?: Record<string, unknown>;
  /** Budget configuration */
  budgetConfig?: Record<string, unknown>;
}

export interface UpdateAgentRequest {
  /** New name */
  name?: string;
  /** New system prompt */
  systemPrompt?: string;
  /** New collection IDs */
  collectionIds?: string[];
  /** New memory config */
  memoryConfig?: Record<string, unknown>;
  /** New auto-retrieval policy */
  retrievalPolicy?: Record<string, unknown>;
  /** New budget config */
  budgetConfig?: Record<string, unknown>;
  /** New status */
  status?: string;
}

export interface AgentListResponse extends ResponseMetadata {
  /** List of agents */
  agents: Agent[];
}

export interface AgentChatRequest {
  /** User message */
  message: string;
  /** Session ID to continue a conversation */
  sessionId?: string;
  /** Optional collection scope override for this session/chat turn */
  collectionIds?: string[];
}

export interface AgentChatResponse extends ResponseMetadata {
  /** Assistant response */
  message: string;
  /** Session ID for follow-up messages */
  sessionId: string;
  /** Source citations */
  citations: unknown[];
  /** Usage statistics */
  stats?: Record<string, unknown>;
}

export interface AgentChatStreamChunk {
  /** Content delta */
  content: string;
  /** Session ID (available from first metadata event) */
  sessionId?: string;
  /** Sources retrieved from Ragora (available on final chunk when done=true) */
  sources: SearchResult[];
  /** Final stats (only on last chunk when done=true) */
  stats?: Record<string, unknown>;
  /** Thinking step (present when the agent emits a status update) */
  thinking?: ThinkingStep;
  /** Whether stream is complete */
  done: boolean;
}

export interface AgentSession {
  /** Session ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Organization ID */
  orgId: string;
  /** Session source */
  source: string;
  /** Source key */
  sourceKey?: string;
  /** Visitor ID */
  visitorId?: string;
  /** Session status */
  status: string;
  /** Number of messages */
  messageCount: number;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

export interface AgentSessionListResponse extends ResponseMetadata {
  /** Sessions */
  sessions: AgentSession[];
  /** Total count */
  total: number;
}

export interface AgentMessage {
  /** Message ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Role: user or assistant */
  role: string;
  /** Message content */
  content: string;
  /** Response latency in ms */
  latencyMs?: number;
  /** Cost in USD */
  costUsd?: number;
  /** Model used */
  model?: string;
  /** Creation timestamp */
  createdAt?: string;
}

export interface AgentSessionDetailResponse extends ResponseMetadata {
  /** Session details */
  session: AgentSession;
  /** Session messages */
  messages: AgentMessage[];
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

// --- Request Options ---

export interface RequestOptions {
  /** Custom request ID (sent as X-Request-ID header) */
  requestId?: string;
  /** Per-request timeout in milliseconds (overrides client-level timeout) */
  timeout?: number;
}
