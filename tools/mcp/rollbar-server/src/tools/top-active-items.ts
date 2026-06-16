import { markdownTable } from '@legacy-sports/mcp-format';
import { rollbarGet } from '../rollbar-api.js';
import type { RollbarItem } from '../format.js';
import type { ToolResult } from '../types.js';

export interface TopActiveItemsParams {
  environment?: string;
}

/** Each entry pairs an item with its per-window occurrence counts. */
interface TopActiveEntry {
  item: RollbarItem;
  counts?: number[];
}

/**
 * Report the most active items in the project (the dashboard "top active
 * items" view), each with its summed recent occurrence count.
 */
export async function topActiveItems(
  params: TopActiveItemsParams,
): Promise<ToolResult> {
  try {
    const result = await rollbarGet<TopActiveEntry[]>({
      path: '/reports/top_active_items',
      query: { environment: params.environment },
    });

    const entries = result ?? [];
    const rows = entries.map((entry) => ({
      counter: entry.item?.counter,
      title: entry.item?.title,
      level: entry.item?.level,
      environment: entry.item?.environment,
      recent_count: (entry.counts ?? []).reduce((sum, n) => sum + n, 0),
    }));

    const text =
      rows.length === 0
        ? 'No active items found.'
        : markdownTable(rows, {
            columns: [
              'counter',
              'title',
              'level',
              'environment',
              'recent_count',
            ],
          });

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        { type: 'text', text: `Failed to fetch top active items: ${message}` },
      ],
    };
  }
}
