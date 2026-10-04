/**
 * Distinguish "a pipeline is running and will register its checks shortly"
 * from "every workflow run for this commit was cancelled, so its checks will
 * never register" (LS-9335).
 *
 * `required-checks.ts` reports a required check with no posted run/status as
 * `(not yet registered)` — a state that is silently correct while CI is still
 * queued, but permanently misleading once every orchestrator run for the head
 * SHA has been cancelled. This module reads the Actions Runs API (a different
 * data source than the Checks/Statuses API `required-checks.ts` uses) to tell
 * the two cases apart, and to flag when the only *completed* run for the
 * branch belongs to a superseded commit rather than the PR's current head —
 * that stale-conclusion mixup cost roughly an hour of debugging on PR #6935
 * (LS-9335 repro: commit cdaf1c2, runs 31421732904 and 31422037097 both
 * cancelled, with only 31419427766 — a failure on the superseded commit
 * e812d4b — ever completing).
 */

import { githubRest } from './github-api.js';

export interface WorkflowRun {
  id: number;
  /** 'queued' | 'in_progress' | 'completed' */
  status: string;
  /** 'success' | 'failure' | 'cancelled' | 'timed_out' | 'skipped' | 'neutral' | 'action_required' | null */
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  created_at: string;
}

interface WorkflowRunsPage {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

/** Fetch every workflow run GitHub has recorded for a specific commit SHA. */
export async function fetchWorkflowRunsForSha(
  owner: string,
  repo: string,
  sha: string,
): Promise<WorkflowRun[]> {
  const all: WorkflowRun[] = [];
  let page = 1;
  for (;;) {
    const data = await githubRest<WorkflowRunsPage>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/actions/runs`,
      query: { head_sha: sha, per_page: '100', page: String(page) },
    });
    all.push(...data.workflow_runs);
    if (all.length >= data.total_count || data.workflow_runs.length === 0) {
      break;
    }
    page++;
  }
  return all;
}

/**
 * Fetch the single most recently *completed* workflow run for `branch`,
 * regardless of which commit it ran against — used to tell a triager when the
 * only finished run belongs to a superseded SHA rather than the PR's current
 * head (AC3).
 */
export async function fetchLatestCompletedRunForBranch(
  owner: string,
  repo: string,
  branch: string,
): Promise<WorkflowRun | null> {
  const data = await githubRest<WorkflowRunsPage>({
    method: 'GET',
    path: `/repos/${owner}/${repo}/actions/runs`,
    query: { branch, status: 'completed', per_page: '1' },
  });
  return data.workflow_runs[0] ?? null;
}

export interface StaleCompletedRun {
  runId: number;
  sha: string;
  conclusion: string | null;
}

export interface NeverRegisteredDiagnosis {
  /** True only when every run for the head SHA is terminal and cancelled — no run is queued/in_progress. */
  neverRan: boolean;
  /** IDs of the cancelled runs for the head SHA, for the re-run nextAction. */
  cancelledRunIds: number[];
  /** Present when the branch's latest completed run belongs to a different (superseded) SHA. */
  staleCompletedRun?: StaleCompletedRun;
}

/**
 * Given the workflow runs recorded for a PR's head SHA, decide whether
 * "required check not yet registered" means "still coming" (a run is queued
 * or in progress — AC2, unchanged CI_PENDING behaviour) or "will never come"
 * (every run for this commit was cancelled — AC1).
 */
export function diagnoseNeverRegistered(
  runsForSha: WorkflowRun[],
  headSha: string,
  latestBranchRun: WorkflowRun | null,
): NeverRegisteredDiagnosis {
  const hasInFlightRun = runsForSha.some(
    (r) => r.status === 'queued' || r.status === 'in_progress',
  );
  const allCancelled =
    runsForSha.length > 0 &&
    !hasInFlightRun &&
    runsForSha.every(
      (r) => r.status === 'completed' && r.conclusion === 'cancelled',
    );

  if (!allCancelled) {
    return { neverRan: false, cancelledRunIds: [] };
  }

  const diagnosis: NeverRegisteredDiagnosis = {
    neverRan: true,
    cancelledRunIds: runsForSha.map((r) => r.id),
  };
  if (latestBranchRun && latestBranchRun.head_sha !== headSha) {
    diagnosis.staleCompletedRun = {
      runId: latestBranchRun.id,
      sha: latestBranchRun.head_sha,
      conclusion: latestBranchRun.conclusion,
    };
  }
  return diagnosis;
}
