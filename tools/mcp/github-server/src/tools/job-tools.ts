import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  listFnJobs,
  MAX_WAIT_MS,
  snapshotFnJob,
  waitForFnJob,
} from '../jobs.js';
import type { ToolResult } from '../types.js';

function notFound(jobId: string): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          ok: false,
          error: `Job "${jobId}" not found in the registry.`,
          hint:
            'Call github_job_list to see recent jobs. Jobs do not survive an MCP ' +
            'server restart — if the job is gone, verify the outcome directly ' +
            '(e.g. github_view_pr / worktree_status) instead of re-running the command.',
        }),
      },
    ],
  };
}

// Synchronous (not async) because snapshotFnJob does no awaiting — an
// `async` signature here tripped @typescript-eslint/require-await. Callers
// (the MCP SDK tool handler in index.ts) await the result either way, so
// this is a type-signature correction only, not an observable behavior
// change.
export function jobStatus(params: { jobId: string }): ToolResult {
  return snapshotFnJob(params.jobId) ?? notFound(params.jobId);
}

export async function jobWait(params: {
  jobId: string;
  maxWaitMs?: number;
}): Promise<ToolResult> {
  const result = await waitForFnJob(
    params.jobId,
    params.maxWaitMs ?? MAX_WAIT_MS,
  );
  return result ?? notFound(params.jobId);
}

export function jobList(): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson({ jobs: listFnJobs() }) }],
  };
}
