import { view } from './view.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface BulkViewParams {
  keys: string[];
  format?: 'markdown' | 'json';
}

interface SucceededEntry {
  key: string;
  format: 'markdown' | 'json';
  /** Parsed JSON ticket when format === 'json', or markdown string otherwise. */
  ticket: unknown;
}

interface FailedEntry {
  key: string;
  error: string;
}

const CONCURRENCY = 5;

/**
 * Fetch up to 50 Jira tickets in one call. Default format is "json" because
 * bulk usage is typically programmatic; pass `format: "markdown"` to embed the
 * compact markdown cards instead. One ticket erroring never fails the whole
 * batch.
 */
export async function bulkView(
  params: BulkViewParams,
): Promise<CallToolResult> {
  const { keys, format = 'json' } = params;

  if (keys.length === 0) {
    return errorResult('keys array is empty');
  }
  if (keys.length > 50) {
    return errorResult(
      `Too many keys (${keys.length}). Maximum per call is 50. Split into batches.`,
    );
  }

  const succeeded: SucceededEntry[] = [];
  const failed: FailedEntry[] = [];

  async function runOne(key: string): Promise<void> {
    try {
      const result = await view({ key, format });
      const text = (result.content[0] as { text: string }).text;
      if (result.isError) {
        failed.push({ key, error: text });
        return;
      }
      const ticket = format === 'json' ? JSON.parse(text) : text;
      succeeded.push({ key, format, ticket });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ key, error: message });
    }
  }

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(runOne));
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed.length === 0,
            total: keys.length,
            succeeded,
            failed,
          },
          null,
          2,
        ),
      },
    ],
    ...(failed.length > 0 ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
  };
}
