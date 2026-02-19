# Changelog

All notable changes to the Ragora Node.js SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
