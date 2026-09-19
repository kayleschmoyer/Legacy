import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  createFnJobRunner,
  type FnJobMetaRecord,
  runWithChildTracking,
} from '@legacy-sports/mcp-jobs';
import type { ToolResult } from './types.js';

/**
 * In-process background-job runner for the git-heavy github-server tools
 * (rebase-pr, bulk-rebase, open-pr's push phase).
 *
 * Cloud Claude Code sessions enforce a ~60s MCP transport timeout on every
 * tool call, so no tool may block longer than MAX_WAIT_MS in a single call.
 * Unlike nx/make/aws-server's `@legacy-sports/mcp-jobs` `createJobRunner`
 * binding — a single spawned OS command — the work here is an async TS
 * function that interleaves `git` child processes with GitHub API calls, so
 * jobs run as in-process promises tracked in a registry. Callers get the
 * tool's final ToolResult when the work finishes within the sync budget, or
 * a { jobId, status: "running" } snapshot to poll with github_job_wait /
 * github_job_status.
 *
 * The promise itself does NOT survive an MCP server restart — a lost jobId
 * means the outcome must be re-verified (e.g. re-check the PR state), not
 * silently re-run. What does survive: `@legacy-sports/mcp-jobs`'s
 * `createFnJobRunner` persists a lightweight existence record per job to
 * disk (namespaced under `github-mcp-jobs`), so a restarted server can still
 * tell a caller "yes, a previous process started that jobId" and report it
 * `orphaned` instead of a bare "not found" — and any `git` child process a
 * job spawned is tree-killed if the job's own wall-clock budget
 * (FN_JOB_TIMEOUT_MS) expires, via `runWithChildTracking`/`registerJobChild`
 * (see rebase-pr.ts / open-pr.ts's git-spawn helpers). See LS-8574 and
 * `lib/mcp-jobs/src/index.ts`'s "Fn-job support" section for the full
 * rationale for this split from the command-based `createJobRunner`.
 */

/** Hard cap for any single blocking wait — stays under the ~60s MCP transport timeout. */
export const MAX_WAIT_MS = 55_000;
/** Default synchronous budget before a tool call returns a running snapshot. */
export const SYNC_BUDGET_MS = 45_000;
/**
 * Wall-clock ceiling for a whole job's fn — generous headroom over the
 * longest single git call (rebasePRWorker's rebase step) plus GitHub API
 * round-trips, so a hung `git`/network call is reaped instead of leaking a
 * job (and its child process) forever.
 */
const FN_JOB_TIMEOUT_MS = 10 * 60_000;
const LOG_TAIL_CHARS = 5_000;
const JOB_LIST_LIMIT = 20;
/** Completed jobs kept for late status queries before being pruned. */
const DONE_JOB_RETENTION = 50;

export type JobLogger = (line: string) => void;

interface FnJobRecord {
  jobId: string;
  label: string;
  startTime: number;
  done: boolean;
  /** Terminal ToolResult — set exactly once when the job settles. */
  result: ToolResult | null;
  logLines: string[];
  /** Settles (never rejects) when the job reaches its terminal state. */
  settled: Promise<void>;
}

// Authoritative for jobs spawned by this server process; in-memory only.
const registry = new Map<string, FnJobRecord>();

// Disk-persisted existence records — lets a restarted server report
// `orphaned` for a jobId it did not itself spawn (AC2, LS-8574).
const diskJobs = createFnJobRunner({
  idPrefix: 'gh',
  dirName: 'github-mcp-jobs',
});

function waitHint(jobId: string): string {
  return (
    `Job still running. Call github_job_wait({ jobId: "${jobId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_MS / 1000}s and returns the tool's final result ` +
    `once done — never an error while the job is in progress). Do NOT re-run the command.`
  );
}

function pruneDoneJobs(): void {
  const done = [...registry.values()]
    .filter((r) => r.done)
    .sort((a, b) => b.startTime - a.startTime);
  for (const record of done.slice(DONE_JOB_RETENTION)) {
    registry.delete(record.jobId);
    // The job completed normally in this process — its disk record no
    // longer serves the orphan-detection this exists for.
    diskJobs.deleteMeta(record.jobId);
  }
}

/**
 * Start an async tool function as a tracked background job. The function's
 * eventual ToolResult (or an isError result built from a thrown error) becomes
 * the job's terminal snapshot.
 */
export function startFnJob(
  label: string,
  fn: (log: JobLogger) => Promise<ToolResult>,
): string {
  pruneDoneJobs();
  const jobId = diskJobs.newJobId();
  const startTime = Date.now();
  const record: FnJobRecord = {
    jobId,
    label,
    startTime,
    done: false,
    result: null,
    logLines: [],
    settled: Promise.resolve(),
  };
  diskJobs.persistMeta(jobId, label, startTime, false);
  record.settled = (async () => {
    try {
      record.result = await runWithChildTracking(
        () => fn((line) => record.logLines.push(line)),
        { timeoutMs: FN_JOB_TIMEOUT_MS },
      );
    } catch (err) {
      record.result = {
        isError: true,
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: false,
              jobId,
              label,
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
      };
    } finally {
      record.done = true;
      diskJobs.persistMeta(jobId, label, startTime, true);
    }
  })();
  registry.set(jobId, record);
  return jobId;
}

function runningSnapshot(record: FnJobRecord): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          jobId: record.jobId,
          status: 'running',
          label: record.label,
          elapsedSec: Math.round((Date.now() - record.startTime) / 1000),
          logTail: record.logLines.join('\n').slice(-LOG_TAIL_CHARS),
          hint: waitHint(record.jobId),
        }),
      },
    ],
  };
}

function orphanedSnapshot(meta: FnJobMetaRecord): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          jobId: meta.jobId,
          status: 'orphaned',
          label: meta.label,
          elapsedSec: Math.round((Date.now() - meta.startTime) / 1000),
          hint:
            'This job was started by a previous MCP server process. Its outcome was an ' +
            'in-process result that does not survive a restart, so it cannot be recovered ' +
            'here — verify the outcome directly (e.g. github_view_pr / worktree_status) ' +
            'instead of re-running the command.',
        }),
      },
    ],
  };
}

/**
 * Non-blocking snapshot: the terminal ToolResult when done, a running
 * snapshot otherwise, an orphaned snapshot for a jobId a previous server
 * process started, or null for a jobId that was never started at all.
 */
export function snapshotFnJob(jobId: string): ToolResult | null {
  const record = registry.get(jobId);
  if (record) {
    if (record.done && record.result) return record.result;
    return runningSnapshot(record);
  }
  const meta = diskJobs.readMeta(jobId);
  return meta ? orphanedSnapshot(meta) : null;
}

/**
 * Wait for a job to settle, bounded by maxWaitMs (capped at MAX_WAIT_MS).
 * Returns the terminal ToolResult once done, a running snapshot if the budget
 * expires first — never an error while the job is in progress.
 */
export async function waitForFnJob(
  jobId: string,
  maxWaitMs = MAX_WAIT_MS,
): Promise<ToolResult | null> {
  const record = registry.get(jobId);
  if (!record) return snapshotFnJob(jobId);
  if (!record.done) {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      record.settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.min(maxWaitMs, MAX_WAIT_MS));
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
  return snapshotFnJob(jobId);
}

/**
 * Sync-then-handoff: start a job and wait up to budgetMs for it to finish.
 * Fast work returns its terminal ToolResult in one call — byte-identical to
 * the pre-job inline behavior; slow work returns a running snapshot with a
 * jobId to poll.
 */
export async function runWithSyncBudget(
  label: string,
  fn: (log: JobLogger) => Promise<ToolResult>,
  budgetMs = SYNC_BUDGET_MS,
): Promise<ToolResult> {
  const jobId = startFnJob(label, fn);
  // The job was just registered, so the lookup cannot miss.
  return (await waitForFnJob(jobId, budgetMs)) as ToolResult;
}

export interface FnJobSummary {
  jobId: string;
  label: string;
  status: 'running' | 'done' | 'orphaned';
  elapsedSec: number;
}

/**
 * List recent jobs (newest first, capped). Merges the in-memory registry
 * (this process) with disk-persisted records from previous server processes
 * that this process never spawned (reported `orphaned`, per AC2).
 */
export function listFnJobs(): FnJobSummary[] {
  const inMemory: Array<FnJobSummary & { startTime: number }> = [
    ...registry.values(),
  ].map((r) => ({
    jobId: r.jobId,
    label: r.label,
    status: r.done ? ('done' as const) : ('running' as const),
    elapsedSec: Math.round((Date.now() - r.startTime) / 1000),
    startTime: r.startTime,
  }));
  const knownIds = new Set(inMemory.map((j) => j.jobId));
  const orphaned: Array<FnJobSummary & { startTime: number }> = diskJobs
    .listMetas()
    .filter((m) => !knownIds.has(m.jobId))
    .map((m) => ({
      jobId: m.jobId,
      label: m.label,
      status: 'orphaned' as const,
      elapsedSec: Math.round((Date.now() - m.startTime) / 1000),
      startTime: m.startTime,
    }));
  return [...inMemory, ...orphaned]
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, JOB_LIST_LIMIT)
    .map(({ jobId, label, status, elapsedSec }) => ({
      jobId,
      label,
      status,
      elapsedSec,
    }));
}

// ---------------------------------------------------------------------------
// Checkout lock
// ---------------------------------------------------------------------------

let checkoutLock: Promise<void> = Promise.resolve();

/**
 * Serialize work that mutates the shared local checkout (fetch/checkout/
 * rebase). Backgrounded rebase jobs could otherwise interleave and corrupt
 * the working tree; each caller queues behind the previous one.
 */
export function withCheckoutLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = checkoutLock.then(fn);
  checkoutLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
