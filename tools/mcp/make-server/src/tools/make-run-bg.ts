import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  MAX_WAIT_MS,
  createJobRunner,
  type JobSnapshot,
} from '@legacy-sports/mcp-jobs';
import type { ToolResult } from '../types.js';
import {
  MAX_OUTPUT_CHARS,
  STRUCTURED_TARGETS,
  parseSteps,
  extractErrors,
  truncateOutput,
  buildCompactOutput,
} from './run-target-utils.js';

export type { JobSnapshot } from '@legacy-sports/mcp-jobs';

/**
 * make-server's binding of the shared background-job runner
 * (`@legacy-sports/mcp-jobs`, LS-8564). Replaces the old in-memory registry:
 * jobs now survive a server restart via disk-persisted metadata, and the
 * internal timeout kills the whole process tree instead of only the direct
 * `make` child (which left nx/node grandchildren running).
 */
const runner = createJobRunner({
  idPrefix: 'make',
  dirName: 'make-run-jobs',
  waitHint: (jobId) =>
    `Job still running. Re-invoke make_run_wait({ jobId: "${jobId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_MS / 1000}s and returns a status snapshot — never an error ` +
    'while the job is in progress). Do NOT re-run the target.',
});

/**
 * Single-call sync budget for job-backed tools — stays safely under the ~60s
 * MCP transport timeout in cloud sessions. Targets that finish inside the
 * budget return their result in one call; slower ones return a running
 * snapshot with a jobId to poll via make_run_wait.
 */
export const SYNC_BUDGET_MS = 45_000;

/** Per-job metadata persisted with the runner so restarts keep formatting context. */
interface MakeJobMeta {
  target: string;
  workDir: string;
  verbose: boolean;
}

function metaOf(snapshot: JobSnapshot): MakeJobMeta {
  const meta = (snapshot.meta ?? {}) as Partial<MakeJobMeta>;
  return {
    target: typeof meta.target === 'string' ? meta.target : snapshot.label,
    workDir: typeof meta.workDir === 'string' ? meta.workDir : snapshot.cwd,
    verbose: meta.verbose === true,
  };
}

/**
 * Start a make target in the background. Returns immediately with a jobId.
 * Use make_run_status or make_run_wait to poll for completion.
 */
export function startMakeInBackground(
  args: string[],
  target: string,
  workDir: string,
  timeoutMs: number,
  verbose = false,
): { jobId: string; logPath: string } {
  const { jobId, logPath } = runner.startJob({
    command: 'make',
    args,
    cwd: workDir,
    label: `make ${target}`,
    timeoutMs,
    meta: { target, workDir, verbose },
  });
  return { jobId, logPath };
}

export function buildStatusResult(
  snapshot: JobSnapshot,
  full: boolean,
  extras: Record<string, unknown> = {},
): ToolResult {
  const { target, workDir, verbose } = metaOf(snapshot);
  const elapsedSec = snapshot.elapsedSec;

  if (snapshot.status === 'running') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'running',
            jobId: snapshot.jobId,
            target,
            elapsedSec,
            ...extras,
            logTail: snapshot.logTail ?? '',
            hint: snapshot.hint,
          }),
        },
      ],
    };
  }

  // A job recovered from a previous server process whose result was never
  // recorded — surface the runner's orphan hint instead of a bogus pass/fail.
  if (snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'orphaned',
            success: false,
            jobId: snapshot.jobId,
            target,
            worktreePath: workDir,
            elapsedSec,
            ...extras,
            logTail: snapshot.logTail ?? '',
            hint: snapshot.hint,
          }),
        },
      ],
      isError: true,
    };
  }

  const log = snapshot.log ?? '';
  const output = full ? log : log.slice(-5000);

  if (STRUCTURED_TARGETS.has(target)) {
    const steps = parseSteps(log);
    const hasPassedMarker = /All pre-commit checks passed/i.test(log);
    const failedCount = steps.filter((s) => s.status === 'failed').length;
    const anyStepFailed = failedCount > 0;
    const success =
      snapshot.exitCode === 0 &&
      !snapshot.error &&
      !anyStepFailed &&
      (hasPassedMarker || steps.length === 0);

    const result: Record<string, unknown> = {
      status: success ? 'done' : 'failed',
      success,
      jobId: snapshot.jobId,
      target,
      worktreePath: workDir,
      elapsedSec,
      ...extras,
      summary: success
        ? `${target} passed${steps.length > 0 ? ` (${steps.length} steps)` : ''}`
        : `${target} failed${failedCount > 0 ? ` (${failedCount} step${failedCount === 1 ? '' : 's'} failed)` : ''}`,
    };
    if (steps.length > 0) result.steps = steps;
    if (!success) {
      const errors = extractErrors(log);
      if (errors.length > 0) result.errors = errors;
    }
    result.output = verbose
      ? truncateOutput(output, MAX_OUTPUT_CHARS)
      : buildCompactOutput(output, MAX_OUTPUT_CHARS);

    return {
      content: [{ type: 'text', text: minifiedJson(result) }],
      isError: !success,
    };
  }

  const success = snapshot.exitCode === 0 && !snapshot.error;
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          status: success ? 'done' : 'failed',
          success,
          jobId: snapshot.jobId,
          target,
          worktreePath: workDir,
          elapsedSec,
          ...extras,
          ...(snapshot.error ? { error: snapshot.error } : {}),
          output: verbose
            ? truncateOutput(output, MAX_OUTPUT_CHARS)
            : buildCompactOutput(output, MAX_OUTPUT_CHARS),
        }),
      },
    ],
    isError: !success,
  };
}

/**
 * Internal helper for other tools (e.g. validate_pr): wait for a job to reach
 * a terminal state, bounded by maxWaitMs (capped at MAX_WAIT_MS by the shared
 * runner), and return its snapshot (which may still be status:"running" when
 * the budget expires). Returns null for an unknown jobId.
 */
export async function waitForJobDone(
  jobId: string,
  maxWaitMs: number,
): Promise<JobSnapshot | null> {
  return runner.waitForJob(jobId, maxWaitMs);
}

/** Read the full log for a job snapshot. Exported for internal tool reuse. */
export function readJobLog(snapshot: JobSnapshot): string {
  return snapshot.log ?? snapshot.logTail ?? '';
}

function unknownJobResult(jobId: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          ok: false,
          error: `Job "${jobId}" not found.`,
        }),
      },
    ],
    isError: true,
  };
}

// ---- make_run_status ----

export interface MakeRunStatusParams {
  jobId: string;
}

export function makeRunStatus(params: MakeRunStatusParams): ToolResult {
  const snapshot = runner.snapshotJob(params.jobId);
  if (!snapshot) {
    return unknownJobResult(params.jobId);
  }
  return buildStatusResult(snapshot, true);
}

// ---- make_run_wait ----

export interface MakeRunWaitParams {
  jobId: string;
  maxWaitMs?: number;
}

/**
 * Block until the job completes or maxWaitMs elapses (default 55 000ms).
 * Capped at 55 000ms to stay under the MCP transport timeout of ~60s in cloud sessions.
 * If still running when the wait expires, returns a status: "running" snapshot so
 * the caller can re-invoke make_run_wait to continue waiting.
 */
export async function makeRunWait(
  params: MakeRunWaitParams,
): Promise<ToolResult> {
  const snapshot = await runner.waitForJob(
    params.jobId,
    params.maxWaitMs ?? MAX_WAIT_MS,
  );
  if (!snapshot) {
    return unknownJobResult(params.jobId);
  }
  return buildStatusResult(snapshot, snapshot.status !== 'running');
}
