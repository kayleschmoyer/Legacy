import { markdownTable, pickFields } from '@legacy-sports/mcp-format';
import { rollbarGet } from '../rollbar-api.js';
import {
  ITEM_LIST_COLUMNS,
  withPageFullHint,
  type RollbarItem,
} from '../format.js';
import type { ToolResult } from '../types.js';

export interface ListItemsParams {
  status?: 'active' | 'resolved' | 'muted' | 'archived';
  level?: 'critical' | 'error' | 'warning' | 'info' | 'debug';
  environment?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

interface ItemsResult {
  items: RollbarItem[];
  page?: number;
}

/** List items in the project, newest activity first. */
export async function listItems(params: ListItemsParams): Promise<ToolResult> {
  try {
    const result = await rollbarGet<ItemsResult>({
      path: '/items',
      query: {
        status: params.status,
        level: params.level,
        environment: params.environment,
        query: params.query,
        page: params.page,
        per_page: params.perPage,
      },
    });

    const items = result.items ?? [];
    const text =
      items.length === 0
        ? 'No items found.'
        : withPageFullHint(
            markdownTable(pickFields(items, ITEM_LIST_COLUMNS), {
              columns: ITEM_LIST_COLUMNS,
            }),
            items.length,
            params.perPage,
            (params.page ?? 1) + 1,
          );

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        { type: 'text', text: `Failed to list Rollbar items: ${message}` },
      ],
    };
  }
}
