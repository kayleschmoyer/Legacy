import { minifiedJson } from '@legacy-sports/mcp-format';
import { summarizeMessage, UNTRUSTED_NOTICE } from './message.js';
import { getChannelId, SNOWFLAKE_PATTERN } from '../auth.js';
import { discordGet } from '../discord-api.js';
import type { DiscordMessage, ToolResult } from '../types.js';

export interface GetMessageParams {
  id: string;
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Fetch one message by id from the one configured channel. */
export async function getMessage(
  params: GetMessageParams,
): Promise<ToolResult> {
  if (!SNOWFLAKE_PATTERN.test(params.id)) {
    return errorResult('`id` must be a numeric Discord message id.');
  }

  try {
    const channelId = getChannelId();
    const raw = await discordGet<DiscordMessage>({
      path: `/channels/${channelId}/messages/${params.id}`,
    });
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            notice: UNTRUSTED_NOTICE,
            message: summarizeMessage(raw),
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(
      `Failed to get Discord message ${params.id}: ${message}`,
    );
  }
}
