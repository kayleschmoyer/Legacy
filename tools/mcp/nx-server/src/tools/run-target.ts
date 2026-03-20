import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

const ALLOWED_TARGETS = new Set([
  'build',
  'test',
  'lint',
  'typecheck',
  'codegen',
  'serve',
  'dev',
  'print-schema',
  'deploy:plan',
  'e2e',
  'integration',
  'storybook',
  'format',
]);

/** Shell metacharacters that must not appear in passthrough args (prevents injection via shell: true). */
const SHELL_METACHAR_REGEX = /[;&|`$(){}]/;

interface RunTargetParams {
  project: string;
  target: string;
  configuration?: string;
  noCache?: boolean;
  args?: string | string[];
  worktreePath?: string;
}

export async function runTarget(params: RunTargetParams): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  if (!ALLOWED_TARGETS.has(params.target)) {
    return {
      content: [
        {
          type: 'text',
          text: `Target "${params.target}" is not in the allowed list. Allowed: ${[...ALLOWED_TARGETS].join(', ')}. Use the terminal for other targets.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const runSpec = params.configuration
      ? `${params.project}:${params.target}:${params.configuration}`
      : `${params.project}:${params.target}`;

    const nxArgs = ['run', runSpec];
    if (params.noCache) nxArgs.push('--skip-nx-cache');
    if (params.args) {
      const tokens = Array.isArray(params.args)
        ? params.args
        : params.args.split(/\s+/).filter(Boolean);

      for (const token of tokens) {
        if (SHELL_METACHAR_REGEX.test(token)) {
          return {
            content: [
              {
                type: 'text',
                text: `Arg "${token}" contains shell metacharacters (;&|\`$(){}) which are not allowed. Pass each flag as a separate array element.`,
              },
            ],
            isError: true,
          };
        }
      }

      nxArgs.push('--', ...tokens);
    }

    const output = await runNx(nxArgs, cwd);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              project: params.project,
              target: params.target,
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
          text: `Failed to run ${params.project}:${params.target}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
