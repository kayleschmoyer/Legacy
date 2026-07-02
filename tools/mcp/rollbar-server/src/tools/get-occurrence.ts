import { rollbarGet } from '../rollbar-api.js';
import type { ToolResult } from '../types.js';

export interface GetOccurrenceParams {
  /** Internal item ID — fetches the most recent occurrence of this item. */
  itemId?: number;
  /** Specific occurrence (instance) ID — fetches that exact occurrence. */
  occurrenceId?: number;
}

interface OccurrenceResult {
  instance: Record<string, unknown>;
}

interface InstancesResult {
  instances: Array<Record<string, unknown>>;
}

/**
 * Fetch the full payload of a Rollbar occurrence (instance) so agents can
 * inspect `data.body` — trace_chain, message, custom, logArgs — without
 * truncation. Accepts either an `occurrenceId` (direct lookup via
 * `/instance/{id}`) or an `itemId` (fetches the most recent occurrence of
 * that item via `/item/{itemId}/instances?per_page=1`).
 */
export async function getOccurrence(
  params: GetOccurrenceParams,
): Promise<ToolResult> {
  const { itemId, occurrenceId } = params;

  if (occurrenceId === undefined && itemId === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide either `occurrenceId` (specific occurrence) or `itemId` (latest occurrence of that item).',
        },
      ],
    };
  }

  try {
    let occurrence: Record<string, unknown>;

    if (occurrenceId !== undefined) {
      const result = await rollbarGet<OccurrenceResult>({
        path: `/instance/${occurrenceId}`,
      });
      occurrence = result.instance;
    } else {
      const result = await rollbarGet<InstancesResult>({
        path: `/item/${itemId}/instances`,
        query: { per_page: 1 },
      });
      const instances = result.instances ?? [];
      if (instances.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No occurrences found for item ${itemId}.`,
            },
          ],
        };
      }
      occurrence = instances[0];
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(occurrence, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const label =
      occurrenceId !== undefined
        ? `occurrence ${occurrenceId}`
        : `latest occurrence of item ${itemId}`;
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch ${label}: ${message}`,
        },
      ],
    };
  }
}
