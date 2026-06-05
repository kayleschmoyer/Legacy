import { execFileSync } from 'node:child_process';
import { runMake, getRepoRoot, TimeoutError } from '../run-command.js';
import type { ToolResult } from '../types.js';
import {
  MAX_OUTPUT_CHARS,
  STRUCTURED_TARGETS,
  parseSteps,
  extractErrors,
  truncateOutput,
  parseAndValidateVariables,
} from './run-target-utils.js';
import { startMakeInBackground } from './make-run-bg.js';

/**
 * Parse the list of files rewritten by the formatter from a make pc error message.
 * Returns the file paths if this is the "formatter rewrote files alongside uncommitted
 * changes" failure, or null if the output does not match that pattern.
 */
function parseFormatterRewrittenFiles(output: string): string[] | null {
  const marker = 'ERROR: Formatting rewrote the following files:';
  const markerIdx = output.indexOf(marker);
  if (markerIdx === -1) return null;
  if (
    !output.includes(
      'You have other uncommitted changes alongside the format fixes',
    )
  )
    return null;

  const afterMarker = output.slice(markerIdx + marker.length);
  const files: string[] = [];
  for (const line of afterMarker.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('You have other')) break;
    if (!trimmed) {
      if (files.length === 0) continue; // skip leading blank lines before file list
      break; // blank line after file list — stop
    }
    files.push(trimmed);
  }
  return files.length > 0 ? files : null;
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

  // Infrastructure
  'ami-build',
  'ami-list',
  'gen-tfvars',
  'runner-apply',
]);

interface RunTargetParams {
  target: string;
  worktreePath?: string;
  variables?: string;
  timeoutMs?: number;
  runInBackground?: boolean;
}

/** Return the last N lines of output for timeout partial-output fields. */
function tailLines(output: string, n = 100): string {
  const lines = output.split('\n');
  return lines.length <= n ? output : lines.slice(-n).join('\n');
}

export async function runTarget(params: RunTargetParams): Promise<ToolResult> {
  const { target, worktreePath, variables } = params;

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

  const workDir = worktreePath || getRepoRoot();
  const args = [target];

  // Parse optional make variables (e.g., "DRYRUN=1 FORCE=1").
  // parseAndValidateVariables is the security gate that blocks command injection
  // through the variables parameter — see run-target-utils.ts.
  if (variables) {
    const validation = parseAndValidateVariables(variables);
    if (!validation.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid variable format: "${validation.invalid}". Expected KEY=VALUE where VALUE contains only alphanumeric characters, hyphens, underscores, dots, slashes, and colons.`,
          },
        ],
        isError: true,
      };
    }
    args.push(...validation.parts);
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
    'ami-build',
    // runner-apply runs terraform plan + apply which can take 10+ minutes.
    // It also has an interactive confirmation prompt — always pass NO_CONFIRM=1
    // via the variables parameter to avoid blocking on stdin (execFile has no tty).
    'runner-apply',
  ]);
  const defaultTimeoutMs = heavyTargets.has(target) ? 600_000 : 300_000;
  // Caller-provided timeoutMs overrides the default; useful for make pc on a cold cache.
  const timeoutMs = params.timeoutMs ?? defaultTimeoutMs;

  // Background mode: spawn the process, return a jobId immediately so the caller
  // can poll with make_run_status / make_run_wait. Avoids the ~60s MCP client
  // transport timeout that kills long-running synchronous tool calls in cloud sessions.
  if (params.runInBackground) {
    const { jobId, logPath } = startMakeInBackground(
      args,
      target,
      workDir,
      timeoutMs,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'running',
              jobId,
              target,
              worktreePath: workDir,
              timeoutMs,
              logPath,
              message:
                'Process started in background. ' +
                'Use make_run_wait({ jobId }) to wait for completion (re-call if still running), ' +
                'or make_run_status({ jobId }) for a non-blocking snapshot.',
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  try {
    const output = await runMake(args, workDir, timeoutMs);

    if (STRUCTURED_TARGETS.has(target)) {
      const steps = parseSteps(output);
      // Check for the "All pre-commit checks passed" marker. While this is the
      // intended success signal, explicitly-failed steps always override it — the
      // marker can appear in NX cached output from a prior run while the current
      // run actually fails.
      const hasPassedMarker = /All pre-commit checks passed/i.test(output);
      const failedCount = steps.filter((s) => s.status === 'failed').length;
      const anyStepFailed = failedCount > 0;
      const allPassed =
        !anyStepFailed && (hasPassedMarker || steps.length === 0);
      const result: Record<string, unknown> = {
        success: allPassed,
        target,
        worktreePath: workDir,
        summary: allPassed
          ? `${target} passed${steps.length > 0 ? ` (${steps.length} steps)` : ''}`
          : `${target} failed${failedCount > 0 ? ` (${failedCount} ${failedCount === 1 ? 'step failed' : 'steps failed'})` : ''}`,
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
              worktreePath: workDir,
              output: truncateOutput(output, MAX_OUTPUT_CHARS),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof TimeoutError) {
      const partialOutput = truncateOutput(
        tailLines(error.partialOutput),
        MAX_OUTPUT_CHARS,
      );
      const result: Record<string, unknown> = {
        success: false,
        timedOut: true,
        target,
        worktreePath: workDir,
        timeoutMs,
        summary: `${target} timed out after ${timeoutMs}ms — pass a larger timeoutMs to allow more time`,
        partialOutput,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: true,
      };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);

    if (STRUCTURED_TARGETS.has(target)) {
      // Auto-recovery: formatter rewrote files alongside uncommitted changes.
      // Commit just the formatter-rewritten files so the next make pc run sees
      // a clean formatter state and can proceed to validate the code.
      const rewrittenFiles = parseFormatterRewrittenFiles(errorMsg);
      if (rewrittenFiles && rewrittenFiles.length > 0) {
        try {
          // Guard: if the index already has staged changes, --only would sweep
          // them into the formatter commit.  Bail out with a clear error instead.
          try {
            execFileSync(
              'git',
              ['-C', workDir, 'diff', '--cached', '--quiet'],
              {
                encoding: 'utf8',
              },
            );
          } catch {
            // Non-zero exit means staged changes exist.
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      target,
                      worktreePath: workDir,
                      autoFormatterCommit: false,
                      error:
                        'Auto-recovery aborted: the git index has staged changes that would be swept into the formatter commit. ' +
                        'Please commit or unstage your staged changes, then re-run make pc.',
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          execFileSync('git', ['-C', workDir, 'add', '--', ...rewrittenFiles], {
            encoding: 'utf8',
          });
          execFileSync(
            'git',
            [
              '-C',
              workDir,
              'commit',
              '--only',
              '-m',
              'style: apply formatting',
              '--',
              ...rewrittenFiles,
            ],
            { encoding: 'utf8' },
          );
          // Retry make pc now that formatter output is committed.
          try {
            const retryOutput = await runMake(args, workDir, timeoutMs);
            const retrySteps = parseSteps(retryOutput);
            const hasPassedMarker = /All pre-commit checks passed/i.test(
              retryOutput,
            );
            const allPassed =
              retrySteps.every((s) => s.status !== 'failed') &&
              (hasPassedMarker || retrySteps.length === 0);
            const retryResult: Record<string, unknown> = {
              success: allPassed,
              target,
              worktreePath: workDir,
              autoFormatterCommit: true,
              summary: allPassed
                ? `${target} passed (formatter output auto-committed)`
                : `${target} failed after auto-committing formatter output`,
            };
            if (retrySteps.length > 0) retryResult.steps = retrySteps;
            retryResult.output = truncateOutput(retryOutput, MAX_OUTPUT_CHARS);
            return {
              content: [
                { type: 'text', text: JSON.stringify(retryResult, null, 2) },
              ],
              isError: !allPassed,
            };
          } catch (retryError) {
            // Retry also failed — report real errors but flag that formatter was committed.
            const retryMsg =
              retryError instanceof Error
                ? retryError.message
                : String(retryError);
            const retrySteps = parseSteps(retryMsg);
            const retryErrors = extractErrors(retryMsg);
            const retryResult: Record<string, unknown> = {
              success: false,
              target,
              worktreePath: workDir,
              autoFormatterCommit: true,
              summary: `${target} failed (formatter output was auto-committed; fix remaining errors)`,
            };
            if (retrySteps.length > 0) retryResult.steps = retrySteps;
            if (retryErrors.length > 0) retryResult.errors = retryErrors;
            retryResult.output = truncateOutput(retryMsg, MAX_OUTPUT_CHARS);
            return {
              content: [
                { type: 'text', text: JSON.stringify(retryResult, null, 2) },
              ],
              isError: true,
            };
          }
        } catch (gitError) {
          // Git operations failed — unstage any staged files (best-effort cleanup)
          // then return a structured error that surfaces the recovery attempt and
          // git failure reason, so the agent is not misled by the original make pc error.
          try {
            execFileSync(
              'git',
              ['-C', workDir, 'reset', 'HEAD', '--', ...rewrittenFiles],
              { encoding: 'utf8' },
            );
          } catch {
            // Ignore — best-effort cleanup only.
          }
          const gitErrMsg =
            gitError instanceof Error
              ? (gitError as Error & { stderr?: string }).stderr?.trim() ||
                gitError.message
              : String(gitError);
          const gitSteps = parseSteps(errorMsg);
          const gitErrors = extractErrors(errorMsg);
          const gitResult: Record<string, unknown> = {
            success: false,
            target,
            worktreePath: workDir,
            autoFormatterFailed: true,
            summary: `${target} failed (formatter auto-recovery failed: ${gitErrMsg})`,
          };
          if (gitSteps.length > 0) gitResult.steps = gitSteps;
          if (gitErrors.length > 0) gitResult.errors = gitErrors;
          gitResult.output = truncateOutput(errorMsg, MAX_OUTPUT_CHARS);
          return {
            content: [
              { type: 'text', text: JSON.stringify(gitResult, null, 2) },
            ],
            isError: true,
          };
        }
      }

      const steps = parseSteps(errorMsg);
      const errors = extractErrors(errorMsg);
      const result: Record<string, unknown> = {
        success: false,
        target,
        worktreePath: workDir,
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
              worktreePath: workDir,
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
