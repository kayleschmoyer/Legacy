import { runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ClosePRParams {
  number: number;
  comment?: string;
}

/** Close a pull request with an optional comment. */
export async function closePR(params: ClosePRParams): Promise<ToolResult> {
  const { number, comment } = params;
  const normalized = comment?.trim();

  try {
    const args = ['pr', 'close', String(number)];
    if (normalized) {
      args.push('--comment', normalized);
    }

    await runGh(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              number,
              message: `PR #${number} closed${normalized ? ' with comment' : ''}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to close PR #${number}: ${message}`,
        },
      ],
    };
  }
}
