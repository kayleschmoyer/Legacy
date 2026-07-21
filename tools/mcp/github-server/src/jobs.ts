import { minifiedJson } from '@legacy-sports/mcp-format';
import type { ToolResult } from './types.js';

/**
 * In-process background-job runner for the git-heavy github-server tools
 * (rebase-pr, bulk-rebase, open-pr's push phase).
 *
 * Cloud Claude Code sessions enforce a ~60s MCP transport timeout on every
 * tool call, so no tool may block longer than MAX_WAIT_MS in a single call.
 * Unlike nx-server's child-process job runner (tools/mcp/nx-server/src/jobs.ts),
 * the work here is an async TS function that interleaves git child processes
 * with GitHub API calls — so jobs run as in-process promises tracked in a
 * registry. Callers get the tool's final ToolResult when the work finishes
 * within the sync budget, or a { jobId, status: "running" } snapshot to poll
 * with github_job_wait / github_job_status.
 *
 * Jobs do NOT survive an MCP server restart — a lost jobId means the outcome
 * must be re-verified (e.g. re-check the PR state), not silently re-run.
 */

/** Hard cap for any single blocking wait — stays under the ~60s MCP transport timeout. */
export const MAX_WAIT_MS = 55_000;
/** Default synchronous budget before a tool call returns a running snapshot. */
export const SYNC_BUDGET_MS = 45_000;
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

function newJobId(): string {
  return `gh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const jobId = newJobId();
  const record: FnJobRecord = {
    jobId,
    label,
    startTime: Date.now(),
    done: false,
    result: null,
    logLines: [],
    settled: Promise.resolve(),
  };
  record.settled = (async () => {
    try {
      record.result = await fn((line) => record.logLines.push(line));
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

/**
 * Non-blocking snapshot: the terminal ToolResult when done, a running
 * snapshot otherwise, or null for an unknown jobId.
 */
export function snapshotFnJob(jobId: string): ToolResult | null {
  const record = registry.get(jobId);
  if (!record) return null;
  if (record.done && record.result) return record.result;
  return runningSnapshot(record);
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
  if (!record) return null;
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
  status: 'running' | 'done';
  elapsedSec: number;
}

/** List recent jobs (newest first, capped). In-memory only — resets with the server. */
export function listFnJobs(): FnJobSummary[] {
  return [...registry.values()]
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, JOB_LIST_LIMIT)
    .map((r) => ({
      jobId: r.jobId,
      label: r.label,
      status: r.done ? ('done' as const) : ('running' as const),
      elapsedSec: Math.round((Date.now() - r.startTime) / 1000),
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
