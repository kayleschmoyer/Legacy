import { markdownTable } from '@legacy-sports/mcp-format';
import { rollbarGet } from '../rollbar-api.js';
import {
  occurrenceSummary,
  type RollbarInstance,
  type RollbarItem,
  withPageFullHint,
} from '../format.js';
import type { ToolResult } from '../types.js';

export interface ListOccurrencesParams {
  itemId?: number;
  counter?: number;
  page?: number;
  perPage?: number;
}

interface InstancesResult {
  instances: RollbarInstance[];
  page?: number;
}

/**
 * List recent occurrences (instances) of an item by its internal `itemId`
 * or by its per-project `counter` (the number in the item URL), each
 * reduced to id, timestamp, version, and a truncated message summary. A
 * `counter` is resolved to an `itemId` via the same `/item_by_counter/{counter}`
 * path that `rollbar_get_item` uses.
 */
export async function listOccurrences(
  params: ListOccurrencesParams,
): Promise<ToolResult> {
  const { counter } = params;

  if (params.itemId === undefined && counter === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide either `itemId` (internal item id) or `counter` (the number in the Rollbar item URL).',
        },
      ],
    };
  }

  try {
    const itemId =
      params.itemId ??
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

    const result = await rollbarGet<InstancesResult>({
      path: `/item/${itemId}/instances`,
      query: { page: params.page, per_page: params.perPage },
    });

    const instances = result.instances ?? [];
    const rows = instances.map((instance) => ({
      id: instance.id,
      timestamp: instance.timestamp,
      version: instance.version,
      summary: occurrenceSummary(instance),
    }));

    const text =
      rows.length === 0
        ? `No occurrences found for item ${itemId}.`
        : withPageFullHint(
            markdownTable(rows, {
              columns: ['id', 'timestamp', 'version', 'summary'],
            }),
            rows.length,
            params.perPage,
            (params.page ?? 1) + 1,
          );

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const label =
      params.itemId !== undefined
        ? `item ${params.itemId}`
        : `counter ${counter}`;
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list occurrences for ${label}: ${message}`,
        },
      ],
    };
  }
}
