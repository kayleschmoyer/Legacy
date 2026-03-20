import { runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ManageLabelsBatchParams {
  prs: number[];
  add?: string[];
  remove?: string[];
}

export async function manageLabelsBatch(
  params: ManageLabelsBatchParams,
): Promise<ToolResult> {
  const uniquePrs = [...new Set(params.prs)];

  if (!params.add?.length && !params.remove?.length) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'No labels to add or remove. Provide at least one of "add" or "remove".',
        },
      ],
    };
  }

  const results: Array<{
    prNumber: number;
    success: boolean;
    error?: string;
  }> = [];

  // Process PRs in parallel batches of 10 to avoid overwhelming gh CLI
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
    const batch = uniquePrs.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (prNumber) => {
      const editArgs = ['pr', 'edit', String(prNumber)];

      if (params.add?.length) {
        for (const label of params.add) {
          editArgs.push('--add-label', label);
        }
      }
      if (params.remove?.length) {
        for (const label of params.remove) {
          editArgs.push('--remove-label', label);
        }
      }

      try {
        await runGh(editArgs);
        return { prNumber, success: true };
      } catch (error) {
        return {
          prNumber,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            requestedTotal: params.prs.length,
            total: results.length,
            succeeded,
            failed,
            labelsAdded: params.add ?? [],
            labelsRemoved: params.remove ?? [],
            results,
          },
          null,
          2,
        ),
      },
    ],
  };
}
