import { rollbarGet } from '../rollbar-api.js';
import type { ToolResult } from '../types.js';

export interface GetOccurrenceParams {
  /** Internal item ID — fetches the most recent occurrence of this item. */
  itemId?: number;
  /** Specific occurrence (instance) ID — fetches that exact occurrence. */
  occurrenceId?: number;
}

interface OccurrenceResult {
  /**
   * Some Rollbar responses nest the instance under `result.instance`; others
   * return the instance object directly as `result` (see the unwrap below).
   */
  instance?: Record<string, unknown>;
}

interface InstancesResult {
  instances: Array<Record<string, unknown>>;
}

/** Narrow an unknown value to a non-null, non-array plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    let occurrence: unknown;

    if (occurrenceId !== undefined) {
      const result = await rollbarGet<
        OccurrenceResult & Record<string, unknown>
      >({ path: `/instance/${occurrenceId}` });
      // `/instance/{id}` returns the instance object directly as the envelope
      // `result` (same convention as `/item/{id}`); some responses instead nest
      // it under `result.instance`. Accept either shape. If `occurrence` were
      // left undefined it would serialize to `undefined` (not a string) below
      // and fail MCP content-schema validation with a Zod invalid_union error.
      occurrence =
        isRecord(result) && isRecord(result.instance)
          ? result.instance
          : result;
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

    if (!isRecord(occurrence)) {
      const label =
        occurrenceId !== undefined
          ? `occurrence ${occurrenceId}`
          : `latest occurrence of item ${itemId}`;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Rollbar returned no usable payload for ${label}.`,
          },
        ],
      };
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
