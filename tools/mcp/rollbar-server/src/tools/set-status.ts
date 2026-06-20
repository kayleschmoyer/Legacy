import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  rollbarGet,
  rollbarPatch,
  RollbarWriteScopeError,
} from '../rollbar-api.js';
import type { RollbarItem } from '../format.js';
import type { ToolResult } from '../types.js';

export type RollbarStatus = 'active' | 'resolved' | 'muted' | 'archived';

export interface SetStatusParams {
  id?: number;
  counter?: number;
  status: RollbarStatus;
}

/**
 * Mutate a Rollbar item's status. Accepts either the internal `id` or the
 * per-project `counter` (the number in the item URL); a counter is resolved to
 * an `id` via the same `/item_by_counter/{counter}` path that `rollbar_get_item`
 * uses, then a single PATCH `/item/{id}/` performs the mutation. Returns the
 * updated item JSON on success.
 */
export async function setStatus(params: SetStatusParams): Promise<ToolResult> {
  const { id, counter, status } = params;

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

  try {
    const itemId =
      id ??
      (await rollbarGet<RollbarItem>({ path: `/item_by_counter/${counter}` }))
        .id;

    if (itemId === undefined) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to resolve Rollbar item id for counter ${counter}.`,
          },
        ],
      };
    }

    const updated = await rollbarPatch<RollbarItem>({
      path: `/item/${itemId}/`,
      body: { status },
    });

    return { content: [{ type: 'text', text: minifiedJson(updated) }] };
  } catch (error) {
    const label = id !== undefined ? `id ${id}` : `counter ${counter}`;
    if (error instanceof RollbarWriteScopeError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to set status on Rollbar item (${label}): ${error.message}`,
          },
        ],
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to set status on Rollbar item (${label}): ${message}`,
        },
      ],
    };
  }
}
