import { createJobRunner, MAX_WAIT_MS } from '@legacy-sports/mcp-jobs';

/**
 * worktree-server's binding of the shared background-job runner
 * (`@legacy-sports/mcp-jobs`, extracted from this file in LS-8564; completed
 * for worktree-server in LS-8725). Jobs are namespaced under `wt-` ids and
 * persist metadata in <tmpdir>/worktree-mcp-jobs; callers poll with
 * worktree_job_wait / worktree_job_status. See the package README for the
 * runner's contract (55s wait cap, tree-kill, orphan detection, idempotency
 * joining, and LS-8358's restart-recovery exit-code sidecar).
 */

export { MAX_WAIT_MS } from '@legacy-sports/mcp-jobs';
export type {
  JobSnapshot,
  JobStatus,
  JobSummary,
  StartJobOptions,
} from '@legacy-sports/mcp-jobs';

const runner = createJobRunner({
  idPrefix: 'wt',
  dirName: 'worktree-mcp-jobs',
  waitHint: (jobId) =>
    `Job still running. Call worktree_job_wait({ jobId: "${jobId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_MS / 1000}s and returns a status snapshot — ` +
    `never an error while the job is in progress). Do NOT re-run the command.`,
});

export const { startJob, snapshotJob, waitForJob, runJobWithBudget, listJobs } =
  runner;
