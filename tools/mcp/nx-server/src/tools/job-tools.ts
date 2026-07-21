import { minifiedJson } from '@legacy-sports/mcp-format';
import { formatTerminalSnapshot } from '../job-formatters.js';
import { MAX_WAIT_MS, listJobs, snapshotJob, waitForJob } from '../jobs.js';
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
  if (snapshot.status === 'done' || snapshot.status === 'failed') {
    body.passed = snapshot.status === 'done';
    if (snapshot.error) body.error = snapshot.error;
    body.output = truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS);
  } else {
    body.logTail = truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS);
    if (snapshot.hint) body.hint = snapshot.hint;
  }
  return {
    content: [{ type: 'text', text: minifiedJson(body) }],
    ...(snapshot.status === 'failed' ? { isError: true } : {}),
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
