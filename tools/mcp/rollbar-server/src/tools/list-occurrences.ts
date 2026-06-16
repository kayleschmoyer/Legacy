import { markdownTable } from '@legacy-sports/mcp-format';
import { rollbarGet } from '../rollbar-api.js';
import {
  occurrenceSummary,
  withPageFullHint,
  type RollbarInstance,
} from '../format.js';
import type { ToolResult } from '../types.js';

export interface ListOccurrencesParams {
  itemId: number;
  page?: number;
  perPage?: number;
}

interface InstancesResult {
  instances: RollbarInstance[];
  page?: number;
}

/**
 * List recent occurrences (instances) of an item by its internal `itemId`,
 * each reduced to id, timestamp, version, and a truncated message summary.
 */
export async function listOccurrences(
  params: ListOccurrencesParams,
): Promise<ToolResult> {
  try {
    const result = await rollbarGet<InstancesResult>({
      path: `/item/${params.itemId}/instances`,
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
        ? `No occurrences found for item ${params.itemId}.`
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
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list occurrences for item ${params.itemId}: ${message}`,
        },
      ],
    };
  }
}
