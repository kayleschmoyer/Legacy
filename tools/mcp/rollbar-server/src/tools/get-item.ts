import { minifiedJson } from '@legacy-sports/mcp-format';
import { rollbarGet } from '../rollbar-api.js';
import type { RollbarItem } from '../format.js';
import type { ToolResult } from '../types.js';

export interface GetItemParams {
  id?: number;
  counter?: number;
}

/**
 * Fetch a single item's details, by internal `id` or by the per-project
 * `counter` (the number shown in the Rollbar dashboard URL).
 */
export async function getItem(params: GetItemParams): Promise<ToolResult> {
  const { id, counter } = params;

  if (id === undefined && counter === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide either `id` (internal item id) or `counter` (the number in the Rollbar item URL).',
        },
      ],
    };
  }

  const path = id !== undefined ? `/item/${id}` : `/item_by_counter/${counter}`;

  try {
    const item = await rollbarGet<RollbarItem>({ path });
    return { content: [{ type: 'text', text: minifiedJson(item) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const label = id !== undefined ? `id ${id}` : `counter ${counter}`;
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch Rollbar item (${label}): ${message}`,
        },
      ],
    };
  }
}
