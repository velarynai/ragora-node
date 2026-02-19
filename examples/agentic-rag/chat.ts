#!/usr/bin/env npx tsx
/**
 * Agentic RAG Chat CLI
 *
 * Interactive chat powered by Ragora's agent system.
 * All RAG logic (search, memory, compaction, tool calls) is handled server-side.
 *
 * Usage:
 *   # Create a new agent for a collection
 *   npx tsx examples/agentic-rag/chat.ts --collection-id your-collection
 *
 *   # Connect to an existing agent
 *   npx tsx examples/agentic-rag/chat.ts --agent-id your-agent-id
 *
 *   # Stream responses
 *   npx tsx examples/agentic-rag/chat.ts --collection-id your-collection --stream
 *
 * Environment Variables:
 *   RAGORA_API_KEY         Your Ragora API key
 *   RAGORA_BASE_URL        API base URL (default: https://api.ragora.app)
 *   RAGORA_COLLECTION_ID   Default collection ID
 *   RAGORA_AGENT_ID        Default agent ID
 */

import * as readline from 'node:readline';
import { parseArgs } from 'node:util';
import { AgenticRAGAgent } from './agent.js';

// ---------------------------------------------------------------------------
// Terminal colors
// ---------------------------------------------------------------------------

const isatty = process.stdout.isTTY ?? false;

const c = {
  reset: isatty ? '\x1b[0m' : '',
  bold: isatty ? '\x1b[1m' : '',
  dim: isatty ? '\x1b[2m' : '',
  red: isatty ? '\x1b[31m' : '',
  green: isatty ? '\x1b[32m' : '',
  yellow: isatty ? '\x1b[33m' : '',
  cyan: isatty ? '\x1b[36m' : '',
} as const;

function colored(text: string, ...codes: string[]): string {
  return `${codes.join('')}${text}${c.reset}`;
}

// ---------------------------------------------------------------------------
// Chat interface
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, string> = {
  '/help': 'Show available commands',
  '/quit': 'Exit the chat',
  '/new': 'Start a new conversation',
  '/sessions': 'List conversation sessions',
  '/history': 'Show messages in current session',
  '/stream': 'Toggle streaming mode',
};

class ChatInterface {
  private agent: AgenticRAGAgent;
  private stream: boolean;
  private rl: readline.Interface;

  constructor(agent: AgenticRAGAgent, stream = false) {
    this.agent = agent;
    this.stream = stream;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private printBanner(): void {
    console.log();
    console.log(colored('=== Ragora Agentic RAG Chat ===', c.cyan, c.bold));
    console.log(colored(`  Agent:   ${this.agent.agentId}`, c.dim));
    if (this.agent.sessionId) {
      console.log(colored(`  Session: ${this.agent.sessionId}`, c.dim));
    }
    console.log(colored('  Type /help for commands, /quit to exit', c.dim));
    console.log();
  }

  private printHelp(): void {
    console.log();
    console.log(colored('Commands:', c.bold));
    for (const [cmd, desc] of Object.entries(COMMANDS)) {
      console.log(`  ${colored(cmd, c.yellow).padEnd(20)} ${desc}`);
    }
    console.log();
  }

  private async handleCommand(command: string): Promise<boolean> {
    const cmd = command.toLowerCase().trim();

    if (cmd === '/quit' || cmd === '/exit') return false;

    if (cmd === '/help') {
      this.printHelp();
    } else if (cmd === '/new') {
      this.agent.newSession();
      console.log(colored('\nStarted new conversation.\n', c.green));
    } else if (cmd === '/sessions') {
      await this.showSessions();
    } else if (cmd === '/history') {
      await this.showHistory();
    } else if (cmd === '/stream') {
      this.stream = !this.stream;
      const mode = this.stream ? 'ON' : 'OFF';
      console.log(colored(`\nStreaming: ${mode}\n`, c.yellow));
    } else {
      console.log(
        colored(`Unknown command: ${command}. Type /help for help.`, c.red),
      );
    }

    return true;
  }

  private async showSessions(): Promise<void> {
    try {
      const result = await this.agent.listSessions();
      if (!result.sessions.length) {
        console.log(colored('\nNo sessions found.\n', c.dim));
        return;
      }
      console.log(
        colored(`\n${result.sessions.length} session(s):`, c.bold),
      );
      for (const s of result.sessions) {
        const statusColor = s.status === 'open' ? c.green : c.dim;
        console.log(
          `  ${s.id.slice(0, 12)}... [${colored(s.status, statusColor)}] ${s.messageCount} messages`,
        );
      }
      console.log();
    } catch (e) {
      console.log(colored(`\nError listing sessions: ${e}\n`, c.red));
    }
  }

  private async showHistory(): Promise<void> {
    if (!this.agent.sessionId) {
      console.log(
        colored('\nNo active session. Send a message first.\n', c.dim),
      );
      return;
    }
    try {
      const detail = await this.agent.getSession(this.agent.sessionId);
      if (!detail.messages.length) {
        console.log(colored('\nNo messages in session.\n', c.dim));
        return;
      }
      console.log();
      for (const msg of detail.messages) {
        const roleColor = msg.role === 'user' ? c.green : c.cyan;
        console.log(
          `  ${colored(msg.role, roleColor, c.bold)}: ${msg.content.slice(0, 200)}`,
        );
      }
      console.log();
    } catch (e) {
      console.log(colored(`\nError: ${e}\n`, c.red));
    }
  }

  private async processQuery(query: string): Promise<void> {
    console.log();
    try {
      if (this.stream) {
        process.stdout.write(colored('Assistant:', c.bold) + '\n');
        for await (const chunk of this.agent.chatStream(query)) {
          if (chunk.content) {
            process.stdout.write(chunk.content);
          }
        }
        console.log('\n');
      } else {
        process.stdout.write(colored('Thinking...', c.dim));
        const result = await this.agent.chat(query);
        // Clear "Thinking..." line
        process.stdout.write('\r\x1b[2K');
        console.log(colored('Assistant:', c.bold));
        console.log(result.message);

        const citations = result.citations ?? [];
        if (citations.length > 0) {
          console.log(
            colored(`\n  [${citations.length} source(s)]`, c.dim),
          );
        }
        console.log();
      }
    } catch (e) {
      console.log(colored(`\nError: ${e}\n`, c.red));
    }
  }

  private prompt(): Promise<string | null> {
    return new Promise((resolve) => {
      this.rl.question(colored('You: ', c.green), (answer) => {
        resolve(answer?.trim() ?? null);
      });
    });
  }

  async run(): Promise<void> {
    this.printBanner();

    while (true) {
      const input = await this.prompt();
      if (input === null) break;
      if (!input) continue;

      if (input.startsWith('/')) {
        const shouldContinue = await this.handleCommand(input);
        if (!shouldContinue) break;
        continue;
      }

      await this.processQuery(input);
    }

    console.log(colored('\nGoodbye!\n', c.cyan));
    this.rl.close();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      'collection-id': { type: 'string', short: 'c' },
      'agent-id': { type: 'string', short: 'a' },
      name: { type: 'string', short: 'n', default: 'RAG Agent' },
      'system-prompt': { type: 'string' },
      stream: { type: 'boolean', short: 's', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`
Ragora Agentic RAG Chat

Usage:
  npx tsx examples/agentic-rag/chat.ts [options]

Options:
  -c, --collection-id <id>    Collection ID to create an agent for
  -a, --agent-id <id>         Existing agent ID to connect to
  -n, --name <name>           Agent name (default: "RAG Agent")
      --system-prompt <text>  Custom system prompt
  -s, --stream                Enable streaming responses
  -h, --help                  Show this help message

Environment Variables:
  RAGORA_API_KEY              Your Ragora API key
  RAGORA_BASE_URL             API base URL (default: https://api.ragora.app)
  RAGORA_COLLECTION_ID        Default collection ID
  RAGORA_AGENT_ID             Default agent ID
`);
    process.exit(0);
  }

  const collectionId =
    values['collection-id'] ?? process.env.RAGORA_COLLECTION_ID;
  const agentId = values['agent-id'] ?? process.env.RAGORA_AGENT_ID;

  if (!agentId && !collectionId) {
    console.error(
      colored(
        'Error: --collection-id or --agent-id is required ' +
          '(or set RAGORA_COLLECTION_ID / RAGORA_AGENT_ID)',
        c.red,
      ),
    );
    process.exit(1);
  }

  let agent: AgenticRAGAgent;
  try {
    agent = await AgenticRAGAgent.create({
      collectionId,
      name: values.name,
      systemPrompt: values['system-prompt'],
      agentId,
    });
  } catch (e) {
    console.error(colored(`Error creating agent: ${e}`, c.red));
    process.exit(1);
  }

  const chat = new ChatInterface(agent, values.stream);
  await chat.run();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
