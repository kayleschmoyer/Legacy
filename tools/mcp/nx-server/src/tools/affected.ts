import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface AffectedParams {
  target?: string;
  base?: string;
  worktreePath?: string;
}

export async function affected(params: AffectedParams): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const base = params.base || 'origin/main';

  try {
    // Get the list of affected projects
    const args = ['show', 'projects', '--affected', `--base=${base}`];
    if (params.target) {
      args.push(`--with-target=${params.target}`);
    }

    const output = await runNx(args, cwd);
    const projects = output
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
              base,
              count: projects.length,
              projects,
              ...(params.target && { filteredByTarget: params.target }),
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
          text: `Failed to determine affected projects: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
