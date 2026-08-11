import { createJobRunner, MAX_WAIT_MS } from '@legacy-sports/mcp-jobs';

/**
 * nx-server's binding of the shared background-job runner
 * (`@legacy-sports/mcp-jobs`, extracted from this file in LS-8564). Jobs are
 * namespaced under `nx-` ids and persist metadata in <tmpdir>/nx-mcp-jobs;
 * callers poll with nx_job_wait / nx_job_status. See the package README for
 * the runner's contract (55s wait cap, tree-kill, orphan detection,
 * idempotency joining).
 */

export { MAX_WAIT_MS } from '@legacy-sports/mcp-jobs';
export type {
  JobSnapshot,
  JobStatus,
  JobSummary,
  StartJobOptions,
} from '@legacy-sports/mcp-jobs';

const runner = createJobRunner({
  idPrefix: 'nx',
  dirName: 'nx-mcp-jobs',
  waitHint: (jobId) =>
    `Job still running. Call nx_job_wait({ jobId: "${jobId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_MS / 1000}s and returns a status snapshot — ` +
    `never an error while the job is in progress). Do NOT re-run the command.`,
});

export const { startJob, snapshotJob, waitForJob, runJobWithBudget, listJobs } =
  runner;
