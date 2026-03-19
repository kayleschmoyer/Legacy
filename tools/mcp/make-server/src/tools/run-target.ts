import { runMake, getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

/**
 * Allowed make targets. Targets not on this list are rejected to prevent
 * arbitrary command execution. Grouped by category for readability.
 */
const ALLOWED_TARGETS = new Set([
  // Validation
  'pc',
  'pre-commit',
  'quick-check',

  // Build / compile
  'build',
  'build-all',
  'build-web',
  'build-mobile',
  'build-lambdas',
  'build-libs',

  // Testing
  'test',
  'test-all',
  'test-e2e',

  // Linting / formatting
  'lint',
  'lint-fix',
  'lint-workflows',
  'lint-skills',
  'format',
  'fmt',
  'format-commit',

  // Type checking
  'typecheck',

  // Code generation
  'codegen',

  // Installation
  'install',
  'install-force',
  'install-node',
  'install-python',
  'setup',
  'setup-force',
  'setup-hooks',

  // Database
  'db-migrate',
  'db-check-connections',

  // Cleaning (safe ones only)
  'clean-safe',
  'clean-cache',
  'reset',

  // Troubleshooting
  'kill-stale',
  'diagnose',

  // Validation
  'validate',

  // Composite
  'full-check',
  'dev-setup',
]);

interface RunTargetParams {
  target: string;
  cwd?: string;
  variables?: string;
}

export async function runTarget(params: RunTargetParams): Promise<ToolResult> {
  const { target, cwd, variables } = params;

  if (!ALLOWED_TARGETS.has(target)) {
    return {
      content: [
        {
          type: 'text',
          text: `Refused: "${target}" is not in the allowed target list.\n\nAllowed targets:\n${[...ALLOWED_TARGETS].sort().join('\n')}`,
        },
      ],
      isError: true,
    };
  }

  const workDir = cwd || getRepoRoot();
  const args = [target];

  // Parse optional make variables (e.g., "DRYRUN=1 FORCE=1")
  if (variables) {
    const varParts = variables.split(/\s+/).filter(Boolean);
    // Validate each variable is KEY=VALUE with safe characters only.
    // Keys: alphanumeric + underscore. Values: alphanumeric, hyphens, underscores,
    // dots, forward slashes, backslashes, colons (for paths like D:\...).
    for (const part of varParts) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_.\/\\:\-]*$/.test(part)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid variable format: "${part}". Expected KEY=VALUE where VALUE contains only alphanumeric characters, hyphens, underscores, dots, slashes, and colons.`,
            },
          ],
          isError: true,
        };
      }
    }
    args.push(...varParts);
  }

  // Longer timeout for heavy targets
  const heavyTargets = new Set([
    'pc',
    'pre-commit',
    'build-all',
    'test-all',
    'install',
    'install-force',
    'full-check',
    'dev-setup',
  ]);
  const timeoutMs = heavyTargets.has(target) ? 600_000 : 300_000;

  try {
    const output = await runMake(args, workDir, timeoutMs);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              target,
              cwd: workDir,
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
          text: JSON.stringify(
            {
              success: false,
              target,
              cwd: workDir,
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
