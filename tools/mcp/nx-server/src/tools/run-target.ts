import { getRepoRoot, runNx } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
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

/**
 * Shell metacharacters that must not appear in passthrough args.
 *
 * On Windows, pnpm is a `.cmd` batch script that requires `shell: true`
 * (cmd.exe). `runCommand` in run-command.ts wraps args containing `|`, `<`,
 * and `>` in double-quotes via `escapeCmdShellArg` so cmd.exe treats them as
 * literals. The remaining characters below are blocked entirely because they
 * have no legitimate use in nx target args and cannot be safely escaped.
 *
 * Pipe `|` is intentionally NOT blocked — it is a valid Jest
 * `--testPathPatterns` alternation operator and is double-quote-wrapped by
 * `escapeCmdShellArg` before the command reaches cmd.exe.
 */
const SHELL_METACHAR_REGEX = /[;&`$(){}]/;

interface RunTargetParams {
  project: string;
  target: string;
  configuration?: string;
  noCache?: boolean;
  updateSnapshot?: boolean;
  args?: string | string[];
  env?: Record<string, string>;
  worktreePath?: string;
}

/**
 * On Windows, multiple space-separated values after --testPathPatterns break
 * the cmd.exe invocation because each token becomes a separate shell word and
 * the pipe used for Jest regex alternation is interpreted by cmd.exe before
 * `escapeCmdShellArg` can wrap it. Coalesce trailing non-flag values into a
 * single pipe-separated token so the whole value is double-quoted as one unit.
 *
 * e.g. ["--testPathPatterns", "FileA", "FileB"] → ["--testPathPatterns", "FileA|FileB"]
 * e.g. ["--testPathPatterns=FileA", "FileB"]    → ["--testPathPatterns=FileA|FileB"]
 *
 * Exported for unit testing.
 */
export function coalesceWindowsTestPathPatterns(tokens: string[]): string[] {
  const result = [...tokens];

  // Bare form: --testPathPatterns value1 value2 ...
  const patternsIdx = result.findIndex((t) => t === '--testPathPatterns');
  if (patternsIdx !== -1 && patternsIdx + 2 < result.length) {
    const valueTokens: string[] = [];
    let i = patternsIdx + 1;
    while (i < result.length && !result[i].startsWith('-')) {
      valueTokens.push(result[i]);
      i++;
    }
    if (valueTokens.length > 1) {
      result.splice(patternsIdx + 1, valueTokens.length, valueTokens.join('|'));
    }
  }

  // Equals form: --testPathPatterns=value1 value2 ...
  const eqIdx = result.findIndex((t) => t.startsWith('--testPathPatterns='));
  if (eqIdx !== -1) {
    const valueTokens: string[] = [];
    let i = eqIdx + 1;
    while (i < result.length && !result[i].startsWith('-')) {
      valueTokens.push(result[i]);
      i++;
    }
    if (valueTokens.length > 0) {
      const base = result[eqIdx];
      result.splice(
        eqIdx,
        1 + valueTokens.length,
        `${base}|${valueTokens.join('|')}`,
      );
    }
  }

  return result;
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
                text: `Arg "${token}" contains shell metacharacters (;&\`$(){}) which are not allowed. Pass each flag as a separate array element.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Translate deprecated Jest flags to current equivalents
      let translated = tokens.map((t) =>
        t.startsWith('--testPathPattern=')
          ? t.replace('--testPathPattern=', '--testPathPatterns=')
          : t === '--testPathPattern'
            ? '--testPathPatterns'
            : t,
      );

      // On Windows, coalesce multiple --testPathPatterns values into a single
      // pipe-separated token before escapeCmdShellArg double-quotes the value.
      if (process.platform === 'win32') {
        translated = coalesceWindowsTestPathPatterns(translated);
      }

      // When running specific tests via --testPathPatterns, automatically add
      // --all to override --onlyChanged baked into package.json test scripts.
      // Without this, jest's --onlyChanged filters out files that haven't been
      // modified in git, causing "0 tests found" even with an explicit pattern.
      if (
        params.target === 'test' &&
        translated.some((t) => t.startsWith('--testPathPatterns'))
      ) {
        if (!translated.some((t) => t === '--all' || t === '--onlyChanged')) {
          translated.push('--all');
        }
      }

      nxArgs.push('--', ...translated);
    } else if (params.updateSnapshot && params.target === 'test') {
      // No extra args provided — still need the -- separator for --updateSnapshot.
      nxArgs.push('--');
    }

    // Append --updateSnapshot after all other Jest flags when requested.
    if (params.updateSnapshot && params.target === 'test') {
      nxArgs.push('--updateSnapshot');
    }

    // Jest writes test names, pass/fail counts, and the summary to stderr.
    // Capture stderr alongside stdout so agents can verify which tests ran.
    const output = await runNx(nxArgs, cwd, {
      env: params.env,
      includeStderr: params.target === 'test',
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              project: params.project,
              target: params.target,
              output: truncateOutput(output, MAX_OUTPUT_CHARS),
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
          text: truncateOutput(
            `Failed to run ${params.project}:${params.target}: ${error instanceof Error ? error.message : String(error)}`,
            MAX_OUTPUT_CHARS,
          ),
        },
      ],
      isError: true,
    };
  }
}
