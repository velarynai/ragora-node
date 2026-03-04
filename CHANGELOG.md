# Changelog

All notable changes to the Ragora Node.js SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-04

### Breaking

- `chat` and `chatStream` now use grouped request options:
  `generation`, `retrieval`, `agentic`, and `metadata`
- Removed flat chat request fields (`model`, `temperature`, `maxTokens`,
  `topK`, retrieval filters, `mode`, `systemPrompt`, `sessionId`) from
  top-level `ChatRequest`

### Added

- Shared retrieval options contract across `search` and `chat`
- OpenAI-style chat completion retrieval parity with support for:
  `versionMode`, `documentKeys`, `domain`, `domainFilterMode`, `graphFilter`,
  and `temporalFilter`
- Agent auto-retrieval policy support on agent create/update via `retrievalPolicy`
- `agentChat` and `agentChatStream` now use auto retrieval only (message/session inputs, with optional `collectionIds` scope)
- Added optional `collectionIds` on `agentChat` / `agentChatStream` for session-level collection scoping
- Extended `graphFilter` in `search()` to support `versionOf`, `relationType`,
  and `fileIds`
- Chat stream parser now handles `ragora.step` events and preserves
  `conversation_id`/session continuity from metadata + completion events
- `ThinkingStep` events in streaming for real-time agent status updates
- Added name-based reference resolution for SDK inputs:
  `collection` (UUID/slug/name) and `products` (UUID/slug/title)
- Kept backward compatibility with legacy `collectionId` / `productIds`
  parameters and explicit conflict errors when both forms are passed
- Exported typed error subclasses: `AuthenticationError`, `AuthorizationError`,
  `NotFoundError`, `RateLimitError`, `ServerError`
- Exported chat sub-option types: `ChatGenerationOptions`,
  `ChatRetrievalOptions`, `ChatAgenticOptions`, `ChatMetadataOptions`
- Exported `RagoraCitation` type for structured citation access
- Automatic retry with exponential backoff for 429 and 5xx errors
  (configurable via `maxRetries` client option)

## [0.1.2] - 2026-02-19

### Added

- Agent CRUD operations (`createAgent`, `getAgent`, `listAgents`, `updateAgent`, `deleteAgent`)
- Agent chat with streaming support (`agentChat`, `agentChatStream`)
- Agent session management (`listAgentSessions`, `getAgentSession`, `deleteAgentSession`)
- Full TypeScript types for agents, sessions, and messages
- Agentic RAG examples (`examples/agentic-rag/`)

### Fixed

- Streaming timeout now resets on each chunk instead of using a fixed wall-clock timeout

## [0.1.0] - 2026-02-07

### Added

- Initial release
- Fetch-based client (works in Node.js, browsers, and edge runtimes)
- Full TypeScript type definitions
- Collections CRUD operations
- Document upload with processing status tracking
- Hybrid search (dense + sparse vectors)
- Chat completions with streaming support
- Marketplace browsing
- Credits and balance management
- Response metadata extraction (cost, rate limits, request IDs)
- Error handling with `RagoraError`
- Next.js integration examples (App Router and Pages Router)
