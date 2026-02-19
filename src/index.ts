/**
 * Ragora JavaScript/TypeScript SDK
 *
 * A simple, fetch-based wrapper for the Ragora API.
 */

export { RagoraClient, type RagoraClientOptions } from './client.js';
export type {
  // Search
  SearchRequest,
  SearchResult,
  SearchResponse,
  // Chat
  ChatMessage,
  ChatRequest,
  ChatChoice,
  ChatResponse,
  ChatStreamChunk,
  ChatUsage,
  // Credits
  CreditBalance,
  // Collections
  Collection,
  CollectionListRequest,
  CollectionListResponse,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  // Documents
  Document,
  DocumentStatus,
  DocumentListRequest,
  DocumentListResponse,
  UploadDocumentRequest,
  UploadResponse,
  DeleteResponse,
  // Marketplace
  Listing,
  MarketplaceProduct,
  MarketplaceListRequest,
  MarketplaceListResponse,
  // Agents
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentListResponse,
  AgentChatRequest,
  AgentChatResponse,
  AgentChatStreamChunk,
  AgentSession,
  AgentSessionListResponse,
  AgentMessage,
  AgentSessionDetailResponse,
  // Errors
  APIError,
  APIErrorDetail,
  // Metadata
  ResponseMetadata,
} from './types.js';
export { RagoraError } from './errors.js';
