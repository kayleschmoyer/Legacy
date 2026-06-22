import { projectListText } from '../format.js';
import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ShowProjectsParams {
  tag?: string;
  affected?: boolean;
  withTarget?: string;
  worktreePath?: string;
}

const NX_ARG_REGEX = /^[a-z0-9-._/:@]+$/i;

export async function showProjects(
  params: ShowProjectsParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  if (params.withTarget != null && !NX_ARG_REGEX.test(params.withTarget)) {
    return {
      content: [
        { type: 'text', text: `Invalid withTarget: "${params.withTarget}".` },
      ],
      isError: true,
    };
  }
  if (params.tag != null && !NX_ARG_REGEX.test(params.tag)) {
    return {
      content: [{ type: 'text', text: `Invalid tag: "${params.tag}".` }],
      isError: true,
    };
  }

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
          text: projectListText(
            {
              ...(params.affected && { mode: 'affected' }),
              ...(params.withTarget && { filteredByTarget: params.withTarget }),
              ...(params.tag && { filteredByTag: params.tag }),
            },
            filtered,
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
