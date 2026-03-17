import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ShowProjectsParams {
  tag?: string;
  affected?: boolean;
  withTarget?: string;
  worktreePath?: string;
}

export async function showProjects(
  params: ShowProjectsParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const args: string[] = ['show', 'projects'];

  if (params.affected) {
    args.push('--affected');
  }

  if (params.withTarget) {
    args.push(`--with-target=${params.withTarget}`);
  }

  if (params.tag) {
    args.push(`--tag=${params.tag}`);
  }

  try {
    const output = await runNx(args, cwd);
    const filtered = output
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              count: filtered.length,
              projects: filtered,
              ...(params.affected && { mode: 'affected' }),
              ...(params.withTarget && { filteredByTarget: params.withTarget }),
              ...(params.tag && { filteredByTag: params.tag }),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
