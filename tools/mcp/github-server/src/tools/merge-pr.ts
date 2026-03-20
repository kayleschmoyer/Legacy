import { runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface MergePRParams {
  number: number;
  strategy: 'queue' | 'direct';
}

export async function mergePR(params: MergePRParams): Promise<ToolResult> {
  const args = ['pr', 'merge', String(params.number), '--squash'];

  if (params.strategy === 'direct') {
    // Direct merge bypasses merge queue via --admin — must be explicitly requested
    args.push('--admin');
  } else {
    // Default: use --auto to enqueue in the merge queue (respects branch protection)
    args.push('--auto');
  }

  try {
    const output = await runGh(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              prNumber: params.number,
              strategy: params.strategy,
              output: output.trim(),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to merge PR #${params.number} (strategy: ${params.strategy}): ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
