import { runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ManageLabelsParams {
  number: number;
  add?: string[];
  remove?: string[];
}

export async function manageLabels(
  params: ManageLabelsParams,
): Promise<ToolResult> {
  const results: Array<{
    action: string;
    label: string;
    success: boolean;
    error?: string;
  }> = [];

  const editArgs = ['pr', 'edit', String(params.number)];
  let hasEdits = false;

  if (params.add?.length) {
    for (const label of params.add) {
      editArgs.push('--add-label', label);
    }
    hasEdits = true;
  }

  if (params.remove?.length) {
    for (const label of params.remove) {
      editArgs.push('--remove-label', label);
    }
    hasEdits = true;
  }

  if (!hasEdits) {
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

  try {
    await runGh(editArgs);
    if (params.add?.length) {
      for (const label of params.add) {
        results.push({ action: 'add', label, success: true });
      }
    }
    if (params.remove?.length) {
      for (const label of params.remove) {
        results.push({ action: 'remove', label, success: true });
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to update labels on PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ prNumber: params.number, results }, null, 2),
      },
    ],
  };
}
