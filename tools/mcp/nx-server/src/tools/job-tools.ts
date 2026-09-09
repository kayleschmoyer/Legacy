import { minifiedJson } from '@legacy-sports/mcp-format';
import { formatPcChunkLogTail } from './run-pc-chunk.js';
import { DAEMON_FAILURE_HINT, isDaemonFailure } from '../daemon-failure.js';
import { formatTerminalSnapshot } from '../job-formatters.js';
import { listJobs, MAX_WAIT_MS, snapshotJob, waitForJob } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

function notFound(jobId: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          ok: false,
          error: `Job "${jobId}" not found in the registry or on disk.`,
          hint: 'Call nx_job_list to see recent jobs, including jobs started by a previous server process.',
        }),
      },
    ],
    isError: true,
  };
}

async function snapshotResult(snapshot: JobSnapshot): Promise<ToolResult> {
  // Terminal snapshots from job-backed tools (meta.kind) get the same
  // structured result the originating tool would have returned inline.
  const formatted = await formatTerminalSnapshot(snapshot);
  if (formatted) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ jobId: snapshot.jobId, ...formatted.body }),
        },
      ],
      ...(formatted.isError ? { isError: true } : {}),
    };
  }

  const body: Record<string, unknown> = {
    jobId: snapshot.jobId,
    status: snapshot.status,
    label: snapshot.label,
    elapsedSec: snapshot.elapsedSec,
  };
  let daemonFailed = false;
  if (snapshot.status === 'done' || snapshot.status === 'failed') {
    // Only nx_run/nx_run_affected jobs (label prefix "nx ") go through this
    // generic fallback un-kinded — e2e-specs and install jobs are caught by
    // formatTerminalSnapshot above and never reach here. A daemon that fails
    // to compute the project graph still exits 0 (LS-8819), so status alone
    // would report a false green on zero tasks run.
    daemonFailed =
      snapshot.status === 'done' &&
      (snapshot.label?.startsWith('nx ') ?? false) &&
      isDaemonFailure(snapshot.log ?? '');
    body.passed = snapshot.status === 'done' && !daemonFailed;
    if (daemonFailed) {
      body.daemonError = true;
      body.hint = DAEMON_FAILURE_HINT;
    }
    if (snapshot.recoveredFromTimeout) body.recoveredFromTimeout = true;
    if (snapshot.error) body.error = snapshot.error;
    body.output = truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS);
  } else {
    // A pc-chunk job still running/orphaned when polled gets the same
    // compaction its terminal result would (LS-9814) — other job kinds are
    // unaffected and keep the raw truncated tail.
    const meta = snapshot.meta as { kind?: unknown; verbose?: unknown };
    body.logTail =
      meta?.kind === 'pc-chunk'
        ? formatPcChunkLogTail(snapshot.logTail ?? '', meta.verbose === true)
        : truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS);
    if (snapshot.hint) body.hint = snapshot.hint;
  }
  return {
    content: [{ type: 'text', text: minifiedJson(body) }],
    ...(snapshot.status === 'failed' || daemonFailed ? { isError: true } : {}),
  };
}

export async function jobStatus(params: {
  jobId: string;
}): Promise<ToolResult> {
  const snapshot = snapshotJob(params.jobId);
  if (!snapshot) return notFound(params.jobId);
  return snapshotResult(snapshot);
}

export async function jobWait(params: {
  jobId: string;
  maxWaitMs?: number;
}): Promise<ToolResult> {
  const snapshot = await waitForJob(
    params.jobId,
    params.maxWaitMs ?? MAX_WAIT_MS,
  );
  if (!snapshot) return notFound(params.jobId);
  return snapshotResult(snapshot);
}

export function jobList(): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson({ jobs: listJobs() }) }],
  };
}
