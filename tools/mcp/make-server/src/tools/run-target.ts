import { runMake, getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

/**
 * Maximum output size in characters before truncation kicks in.
 * Set conservatively to account for JSON escaping overhead (~2x in worst case).
 */
const MAX_OUTPUT_CHARS = 30_000;

/** Targets whose output should be parsed into structured step results. */
const STRUCTURED_TARGETS = new Set(['pc', 'pre-commit', 'full-check']);

interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'unknown';
}

/**
 * Parse the output of multi-step targets like `make pc` into structured step results.
 * Matches the actual Makefile format: "1/9 Migration immutability check..."
 */
function parseSteps(output: string): StepResult[] {
  const steps: StepResult[] = [];

  // Match the actual make pc step format: "N/M Step name..."
  const stepPattern = /^(\d+)\/(\d+)\s+(.+?)\.{3}\s*$/gm;
  let match;
  const stepEntries: Array<{ index: number; name: string }> = [];

  while ((match = stepPattern.exec(output)) !== null) {
    stepEntries.push({
      index: match.index,
      name: match[3].trim(),
    });
  }

  // For each step, check the text between it and the next step for pass/fail
  for (let i = 0; i < stepEntries.length; i++) {
    const start = stepEntries[i].index;
    const end =
      i + 1 < stepEntries.length ? stepEntries[i + 1].index : output.length;
    const section = output.slice(start, end);

    const failed = /(?:FAIL|ERROR|failed|✗|exit code [1-9]|error TS\d)/im.test(
      section,
    );
    const passed = /(?:✓|passed|succeeded|SUCCESS)/im.test(section);

    steps.push({
      name: stepEntries[i].name,
      status: failed ? 'failed' : passed ? 'passed' : 'unknown',
    });
  }

  return steps;
}

/**
 * Extract error lines from output — lines containing error indicators.
 */
function extractErrors(output: string): string[] {
  const errorLines: string[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:ERROR|FAIL|error\b|failed\b|✗)/i.test(line) &&
      !/node_modules/.test(line) &&
      !/^[\s]*at\s/.test(line)
    ) {
      errorLines.push(line.trim());
      // Include next 2 lines for context
      if (i + 1 < lines.length && lines[i + 1].trim()) {
        errorLines.push(lines[i + 1].trim());
      }
      if (i + 2 < lines.length && lines[i + 2].trim()) {
        errorLines.push(lines[i + 2].trim());
      }
    }
  }

  // Deduplicate and limit
  return [...new Set(errorLines)].slice(0, 50);
}

/**
 * Truncate output intelligently: keep the head and tail (where pass/fail lives).
 */
function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const headSize = Math.floor(maxChars * 0.3);
  const tailSize = Math.floor(maxChars * 0.7);
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  const omitted = output.length - headSize - tailSize;

  return `${head}\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n${tail}`;
}

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

    if (STRUCTURED_TARGETS.has(target)) {
      const steps = parseSteps(output);
      // The definitive success indicator is the "All pre-commit checks passed"
      // marker at the end of output. Step-level regex matching can produce false
      // positives (e.g., "error" in a URL or log line), so the final marker wins.
      const hasPassedMarker = /All pre-commit checks passed/i.test(output);
      const allPassed =
        hasPassedMarker ||
        steps.length === 0 ||
        steps.every((s) => s.status !== 'failed');
      const result: Record<string, unknown> = {
        success: allPassed,
        target,
        cwd: workDir,
        summary: allPassed
          ? `${target} passed${steps.length > 0 ? ` (${steps.length} steps)` : ''}`
          : `${target} completed with failures`,
      };
      if (steps.length > 0) result.steps = steps;
      result.output = truncateOutput(output, MAX_OUTPUT_CHARS);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              target,
              cwd: workDir,
              output: truncateOutput(output, MAX_OUTPUT_CHARS),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (STRUCTURED_TARGETS.has(target)) {
      const steps = parseSteps(errorMsg);
      const errors = extractErrors(errorMsg);
      const result: Record<string, unknown> = {
        success: false,
        target,
        cwd: workDir,
        summary: `${target} failed`,
      };
      if (steps.length > 0) result.steps = steps;
      if (errors.length > 0) result.errors = errors;
      result.output = truncateOutput(errorMsg, MAX_OUTPUT_CHARS);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              target,
              cwd: workDir,
              error: truncateOutput(errorMsg, MAX_OUTPUT_CHARS),
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
