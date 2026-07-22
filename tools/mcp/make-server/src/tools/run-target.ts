import { execFileSync } from 'node:child_process';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';
import {
  MAX_OUTPUT_CHARS,
  STRUCTURED_TARGETS,
  parseSteps,
  extractErrors,
  truncateOutput,
  buildCompactOutput,
  parseAndValidateVariables,
} from './run-target-utils.js';
import {
  SYNC_BUDGET_MS,
  buildStatusResult,
  readJobLog,
  startMakeInBackground,
  waitForJobDone,
} from './make-run-bg.js';
import type { JobSnapshot } from './make-run-bg.js';

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

  // Stepwise pre-commit (timeout-resilient validation for cloud/ephemeral
  // sessions, LS-7906). Equivalent to `pc` only when ALL steps run in order:
  // pc-db-prep -> pc-typecheck -> pc-format -> pc-lint -> pc-workflows -> pc-test -> pc-build
  'pc-db-prep',
  'pc-typecheck',
  'pc-format',
  'pc-lint',
  'pc-workflows',
  'pc-test',
  'pc-build',

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
  // Read-only self-review checks (LS-8565) — the review skill routes these
  // through make_run.
  'lint-review-patterns',
  'lint-touch-map',
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
  verbose?: boolean;
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
    // Heavy pc step targets — nx affected typecheck/test/build can each exceed
    // the 5-minute default on a cold cache.
    'pc-typecheck',
    'pc-test',
    'pc-build',
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

  // Every invocation runs as a background job — the synchronous path was
  // killed by the ~60s MCP transport timeout in cloud sessions long before
  // its 300–600s process timeouts could matter. runInBackground keeps its
  // immediate-return contract; the default path waits up to a bounded sync
  // budget so fast targets still complete in one call while slow ones hand
  // back a jobId to poll with make_run_wait.
  const { jobId, logPath } = startMakeInBackground(
    args,
    target,
    workDir,
    timeoutMs,
    params.verbose ?? false,
  );

  if (params.runInBackground) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
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
          }),
        },
      ],
    };
  }

  const deadline = Date.now() + SYNC_BUDGET_MS;
  const record = await waitForJobDone(jobId, SYNC_BUDGET_MS);
  // The job was just started, so the registry lookup cannot miss.
  if (!record) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            target,
            worktreePath: workDir,
            error: `Job "${jobId}" vanished from the registry — re-run the target.`,
          }),
        },
      ],
      isError: true,
    };
  }
  if (record.status === 'running') {
    return buildStatusResult(record, false);
  }

  return finishCompletedRun(record, {
    target,
    workDir,
    args,
    timeoutMs,
    deadline,
    verbose: params.verbose ?? false,
  });
}

interface RunContext {
  target: string;
  workDir: string;
  args: string[];
  timeoutMs: number;
  /** Sync-budget deadline shared with any auto-recovery retry. */
  deadline: number;
  verbose: boolean;
}

/** Format a terminal job snapshot, applying formatter auto-recovery for structured targets. */
async function finishCompletedRun(
  record: JobSnapshot,
  ctx: RunContext,
): Promise<ToolResult> {
  const timedOut =
    record.error != null && /internal timeout/i.test(record.error);
  const extras: Record<string, unknown> = timedOut
    ? {
        timedOut: true,
        timeoutMs: ctx.timeoutMs,
        hint: `${ctx.target} hit its ${ctx.timeoutMs}ms process timeout — pass a larger timeoutMs to allow more time`,
      }
    : {};

  const failed = record.exitCode !== 0 || record.error !== null;
  if (failed && !timedOut && STRUCTURED_TARGETS.has(ctx.target)) {
    const log = readJobLog(record);
    const rewrittenFiles = parseFormatterRewrittenFiles(log);
    if (rewrittenFiles && rewrittenFiles.length > 0) {
      return autoCommitFormatterAndRetry(rewrittenFiles, log, ctx);
    }
  }

  return buildStatusResult(record, true, extras);
}

/**
 * Auto-recovery: the formatter rewrote files alongside uncommitted changes.
 * Commit just the formatter-rewritten files so the next run sees a clean
 * formatter state, then retry the target as a new background job within the
 * remaining sync budget.
 */
async function autoCommitFormatterAndRetry(
  rewrittenFiles: string[],
  failureLog: string,
  ctx: RunContext,
): Promise<ToolResult> {
  try {
    // Guard: if the index already has staged changes, --only would sweep
    // them into the formatter commit.  Bail out with a clear error instead.
    try {
      execFileSync('git', ['-C', ctx.workDir, 'diff', '--cached', '--quiet'], {
        encoding: 'utf8',
      });
    } catch {
      // Non-zero exit means staged changes exist.
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: false,
              target: ctx.target,
              worktreePath: ctx.workDir,
              autoFormatterCommit: false,
              error:
                'Auto-recovery aborted: the git index has staged changes that would be swept into the formatter commit. ' +
                'Please commit or unstage your staged changes, then re-run make pc.',
            }),
          },
        ],
        isError: true,
      };
    }
    execFileSync('git', ['-C', ctx.workDir, 'add', '--', ...rewrittenFiles], {
      encoding: 'utf8',
    });
    execFileSync(
      'git',
      [
        '-C',
        ctx.workDir,
        'commit',
        '--only',
        '-m',
        'style: apply formatting',
        '--',
        ...rewrittenFiles,
      ],
      { encoding: 'utf8' },
    );
  } catch (gitError) {
    // Git operations failed — unstage any staged files (best-effort cleanup)
    // then return a structured error that surfaces the recovery attempt and
    // git failure reason, so the agent is not misled by the original failure.
    try {
      execFileSync(
        'git',
        ['-C', ctx.workDir, 'reset', 'HEAD', '--', ...rewrittenFiles],
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
    const gitSteps = parseSteps(failureLog);
    const gitErrors = extractErrors(failureLog);
    const gitResult: Record<string, unknown> = {
      success: false,
      target: ctx.target,
      worktreePath: ctx.workDir,
      autoFormatterFailed: true,
      summary: `${ctx.target} failed (formatter auto-recovery failed: ${gitErrMsg})`,
    };
    if (gitSteps.length > 0) gitResult.steps = gitSteps;
    if (gitErrors.length > 0) gitResult.errors = gitErrors;
    gitResult.output = ctx.verbose
      ? truncateOutput(failureLog, MAX_OUTPUT_CHARS)
      : buildCompactOutput(failureLog, MAX_OUTPUT_CHARS);
    return {
      content: [{ type: 'text', text: minifiedJson(gitResult) }],
      isError: true,
    };
  }

  // Retry now that formatter output is committed — as a background job within
  // whatever remains of the sync budget.
  const { jobId: retryJobId } = startMakeInBackground(
    ctx.args,
    ctx.target,
    ctx.workDir,
    ctx.timeoutMs,
    ctx.verbose,
  );
  const remaining = Math.max(ctx.deadline - Date.now(), 1_000);
  const retryRecord = await waitForJobDone(retryJobId, remaining);
  if (!retryRecord) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            target: ctx.target,
            worktreePath: ctx.workDir,
            autoFormatterCommit: true,
            error: `Retry job "${retryJobId}" vanished from the registry — re-run the target.`,
          }),
        },
      ],
      isError: true,
    };
  }
  return buildStatusResult(retryRecord, retryRecord.status !== 'running', {
    autoFormatterCommit: true,
  });
}
