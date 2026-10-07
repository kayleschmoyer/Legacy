import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Re-export the SDK result type under a short local alias. */
export type ToolResult = CallToolResult;

/** The subset of a Discord user object this server reads. */
export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
}

/** The subset of a Discord message object this server reads. */
export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: DiscordUser;
}

/** The only message shape this server returns to callers. */
export interface MessageSummary {
  id: string;
  timestamp: string;
  author: string;
  content: string;
}
