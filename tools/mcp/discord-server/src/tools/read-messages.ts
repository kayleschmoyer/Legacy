import { minifiedJson } from '@legacy-sports/mcp-format';
import { summarizeMessage, UNTRUSTED_NOTICE } from './message.js';
import { getChannelId, SNOWFLAKE_PATTERN } from '../auth.js';
import { discordGet } from '../discord-api.js';
import type { DiscordMessage, MessageSummary, ToolResult } from '../types.js';

/** Messages returned when the caller does not pass `limit`. */
export const DEFAULT_LIMIT = 25;

/** Hard per-call cap — Discord itself refuses more than 100 per request. */
export const MAX_LIMIT = 100;

export interface ReadMessagesParams {
  limit?: number;
  before?: string;
  after?: string;
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Order two snowflakes numerically; they are decimal strings of varying length. */
function compareSnowflakes(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Read recent messages from the one configured channel, returned oldest-first.
 *
 * Pagination is by message id: pass `before` (an id from a previous
 * `oldestId`) to walk back in time, or `after` (a previous `newestId`) to pick
 * up only what is new. The channel is never a parameter.
 */
export async function readMessages(
  params: ReadMessagesParams,
): Promise<ToolResult> {
  if (params.before !== undefined && params.after !== undefined) {
    return errorResult('Pass either `before` or `after`, not both.');
  }
  for (const [name, value] of [
    ['before', params.before],
    ['after', params.after],
  ] as const) {
    if (value !== undefined && !SNOWFLAKE_PATTERN.test(value)) {
      return errorResult(`\`${name}\` must be a numeric Discord message id.`);
    }
  }

  const requested = params.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1) {
    return errorResult('`limit` must be a positive integer.');
  }
  const limit = Math.min(requested, MAX_LIMIT);

  try {
    const channelId = getChannelId();
    const raw = await discordGet<DiscordMessage[]>({
      path: `/channels/${channelId}/messages`,
      query: { limit, before: params.before, after: params.after },
    });

    const messages: MessageSummary[] = raw
      .map(summarizeMessage)
      .sort((a, b) => compareSnowflakes(a.id, b.id));

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            notice: UNTRUSTED_NOTICE,
            count: messages.length,
            oldestId: messages[0]?.id ?? null,
            newestId: messages[messages.length - 1]?.id ?? null,
            messages,
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(`Failed to read Discord messages: ${message}`);
  }
}
