/**
 * Agentic RAG Agent
 *
 * Thin wrapper around the Ragora SDK's agent chat system.
 * All the heavy lifting (knowledge search, memory management, compaction,
 * tool calls) is handled server-side by the agent service.
 *
 * Usage:
 *   const agent = await AgenticRAGAgent.create({ collectionId: "my-collection" });
 *   const result = await agent.chat("What are the key design choices?");
 *   console.log(result.message);
 */

import { RagoraClient } from '../../src/index.js';
import type { AgentChatStreamChunk } from '../../src/types.js';

export interface CreateAgentOptions {
  /** Collection ID to link (required when creating a new agent) */
  collectionId?: string;
  /** Agent name (used when creating) */
  name?: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Budget/search config (e.g. { top_k: 10 }) */
  budgetConfig?: Record<string, unknown>;
  /** Ragora API key (falls back to RAGORA_API_KEY env var) */
  apiKey?: string;
  /** API base URL (falls back to RAGORA_BASE_URL env var) */
  baseUrl?: string;
  /** Existing agent ID to connect to */
  agentId?: string;
}

export interface ChatResult {
  message: string;
  sessionId: string;
  citations: unknown[];
  stats?: Record<string, unknown>;
}

export interface StreamChunk {
  content: string;
  sessionId?: string;
  stats?: Record<string, unknown>;
  done: boolean;
}

export class AgenticRAGAgent {
  readonly client: RagoraClient;
  readonly agentId: string;
  sessionId: string | undefined;

  constructor(client: RagoraClient, agentId: string, sessionId?: string) {
    this.client = client;
    this.agentId = agentId;
    this.sessionId = sessionId;
  }

  /**
   * Create or connect to an agent.
   *
   * If `agentId` is provided, connects to an existing agent.
   * Otherwise, creates a new one linked to the given collection.
   */
  static async create(options: CreateAgentOptions): Promise<AgenticRAGAgent> {
    const apiKey = options.apiKey ?? process.env.RAGORA_API_KEY;
    if (!apiKey) {
      throw new Error(
        'RAGORA_API_KEY is required. Set it as an env var or pass apiKey.',
      );
    }

    const client = new RagoraClient({
      apiKey,
      baseUrl:
        options.baseUrl ??
        process.env.RAGORA_BASE_URL ??
        'https://api.ragora.app',
    });

    if (options.agentId) {
      await client.getAgent(options.agentId);
      return new AgenticRAGAgent(client, options.agentId);
    }

    if (!options.collectionId) {
      throw new Error('collectionId is required when creating a new agent');
    }

    const agent = await client.createAgent({
      name: options.name ?? 'RAG Agent',
      collectionIds: [options.collectionId],
      systemPrompt: options.systemPrompt,
      budgetConfig: options.budgetConfig,
    });

    return new AgenticRAGAgent(client, agent.id);
  }

  /**
   * Send a message and get a response.
   * Automatically tracks the session ID for multi-turn conversations.
   */
  async chat(message: string): Promise<ChatResult> {
    const response = await this.client.agentChat(this.agentId, {
      message,
      sessionId: this.sessionId,
    });

    if (response.sessionId) {
      this.sessionId = response.sessionId;
    }

    return {
      message: response.message,
      sessionId: response.sessionId,
      citations: response.citations,
      stats: response.stats,
    };
  }

  /**
   * Stream a response token by token.
   * Yields objects with: content, sessionId, stats, done.
   */
  async *chatStream(message: string): AsyncGenerator<StreamChunk> {
    const stream = this.client.agentChatStream(this.agentId, {
      message,
      sessionId: this.sessionId,
    });

    for await (const chunk of stream) {
      if (chunk.sessionId) {
        this.sessionId = chunk.sessionId;
      }
      yield {
        content: chunk.content,
        sessionId: chunk.sessionId,
        stats: chunk.stats,
        done: chunk.done ?? false,
      };
    }
  }

  /** Start a new conversation session. */
  newSession(): void {
    this.sessionId = undefined;
  }

  /** List all sessions for this agent. */
  async listSessions() {
    return this.client.listAgentSessions(this.agentId);
  }

  /** Get a session with its messages. */
  async getSession(sessionId: string) {
    return this.client.getAgentSession(this.agentId, sessionId);
  }

  /** Delete a session and clean up its memory. */
  async deleteSession(sessionId: string) {
    return this.client.deleteAgentSession(this.agentId, sessionId);
  }
}
