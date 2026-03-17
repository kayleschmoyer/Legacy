import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

const ALLOWED_TARGETS = new Set([
  'build',
  'test',
  'lint',
  'typecheck',
  'codegen',
]);

interface RunAffectedParams {
  target: string;
  base?: string;
  fix?: boolean;
  worktreePath?: string;
}

export async function runAffected(
  params: RunAffectedParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const base = params.base || 'origin/main';

  if (!ALLOWED_TARGETS.has(params.target)) {
    return {
      content: [
        {
          type: 'text',
          text: `Target "${params.target}" is not in the allowed list for affected runs. Allowed: ${[...ALLOWED_TARGETS].join(', ')}.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const args = ['affected', '-t', params.target, `--base=${base}`];
    if (params.fix && params.target === 'lint') {
      args.push('--fix');
    }

    const output = await runNx(args, cwd);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              target: params.target,
              base,
              output,
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
          text: `Failed to run affected ${params.target}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
