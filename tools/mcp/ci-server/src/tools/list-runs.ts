import { basename } from 'node:path';
import { formatRunList } from '../format.js';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: GitHubWorkflow[];
}

/**
 * Resolve a workflow identifier to a value accepted by the GitHub API
 * (numeric ID string or filename like `ci-pipeline.yml`).
 *
 * GitHub's `/actions/workflows/{workflow_id}/runs` endpoint only accepts a
 * numeric ID or filename — not a display name like "CI Pipeline". When the
 * caller passes a display name, list all workflows and find the matching one
 * by name (case-insensitive), then return its filename.
 */
export async function resolveWorkflowId(workflow: string): Promise<string> {
  const normalized = workflow.trim();
  if (normalized === '') {
    throw new Error(
      'Workflow identifier cannot be empty or whitespace-only. Please provide a workflow name, numeric ID, or filename.',
    );
  }
  // Normalize: if a full path like ".github/workflows/ci.yml" was passed, extract just the filename.
  // Replace backslashes first so that Windows-style paths work correctly on Linux hosts
  // (node:path basename uses the host OS separator).
  const normalizedPath = normalized.replace(/\\/g, '/');
  const workflowIdCandidate = /\.ya?ml$/i.test(normalizedPath)
    ? basename(normalizedPath)
    : normalizedPath;

  // Already a numeric ID or a filename — use directly.
  if (
    /^\d+$/.test(workflowIdCandidate) ||
    /\.ya?ml$/i.test(workflowIdCandidate)
  ) {
    return workflowIdCandidate;
  }

  // Display name: paginate through all workflows until we find a match.
  const perPage = 100;
  const targetName = normalized.toLowerCase();
  const allWorkflows: GitHubWorkflow[] = [];
  let page = 1;

  const firstPage = await githubGet<GitHubWorkflowsResponse>(
    `/actions/workflows?per_page=${perPage}&page=${page}`,
  );
  allWorkflows.push(...firstPage.workflows);
  const totalCount = firstPage.total_count;

  let match = firstPage.workflows.find(
    (w) => w.name.toLowerCase() === targetName,
  );

  while (!match && allWorkflows.length < totalCount) {
    page += 1;
    const nextPage = await githubGet<GitHubWorkflowsResponse>(
      `/actions/workflows?per_page=${perPage}&page=${page}`,
    );
    if (nextPage.workflows.length === 0) break;
    allWorkflows.push(...nextPage.workflows);
    match = nextPage.workflows.find((w) => w.name.toLowerCase() === targetName);
  }

  if (!match) {
    // Fall back to partial/substring match (case-insensitive).
    const partialMatches = allWorkflows.filter((w) =>
      w.name.toLowerCase().includes(targetName),
    );
    if (partialMatches.length === 1) {
      return basename(partialMatches[0].path);
    }
    if (partialMatches.length > 1) {
      const names = partialMatches.map((w) => `"${w.name}"`).join(', ');
      throw new Error(
        `Ambiguous workflow name "${normalized}" — ${partialMatches.length} partial matches: ${names}. Use a more specific name or the exact workflow filename.`,
      );
    }
    const names = allWorkflows.map((w) => `"${w.name}"`).join(', ');
    throw new Error(
      `No workflow found with name "${normalized}". Available: ${names}`,
    );
  }
  // path is like ".github/workflows/ci-pipeline.yml" — use the filename only.
  return basename(match.path);
}

/** Matches a full 40-character hex commit SHA (case-insensitive). */
const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
/** Matches a plausible abbreviated commit SHA prefix (git's own minimum is 4). */
const ABBREVIATED_SHA_RE = /^[0-9a-f]{4,39}$/i;

/**
 * Resolve a commit identifier to the full 40-character SHA GitHub's
 * `head_sha` workflow-run filter requires an exact match against.
 *
 * `GET /actions/runs?head_sha=` only matches the full SHA — an abbreviated
 * SHA (the form `git log --oneline` / `worktree_commit` naturally produce)
 * silently matches nothing (LS-9589). `GET /repos/{owner}/{repo}/commits/{ref}`
 * accepts an abbreviated SHA and returns the commit's full `sha`, so resolve
 * through it first — same semantics as `git rev-parse --short`.
 *
 * A full SHA is returned unchanged (no extra request). A value that isn't a
 * full SHA and doesn't even look like a hex prefix (a branch name passed by
 * mistake, say) is also returned unchanged, so it degrades to today's
 * exact-match behavior rather than wasting a lookup. If the lookup itself
 * fails (unknown/ambiguous prefix), the original value is returned so the
 * `head_sha` filter still degrades gracefully instead of hard-failing the
 * whole list call.
 */
export async function resolveCommitSha(commit: string): Promise<string> {
  const trimmed = commit.trim();
  if (FULL_SHA_RE.test(trimmed) || !ABBREVIATED_SHA_RE.test(trimmed)) {
    return trimmed;
  }
  try {
    const data = await githubGet<{ sha: string }>(
      `/commits/${encodeURIComponent(trimmed)}`,
    );
    return data.sha;
  } catch {
    return trimmed;
  }
}

interface ListRunsParams {
  branch?: string;
  workflow?: string;
  status?: string;
  event?: string;
  commit?: string;
  user?: string;
  limit?: number;
}

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  run_attempt: number;
  conclusion: string | null;
  created_at: string;
  display_title: string;
  event: string;
  head_branch: string;
  head_sha: string;
  name: string;
  started_at?: string | null;
  status: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
}

interface GitHubRunsResponse {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
}

function mapRun(run: GitHubWorkflowRun) {
  return {
    // `id` is the value to pass as `runId` to ci_rerun, ci_view_run, ci_get_logs, etc.
    id: run.id,
    attempt: run.run_attempt,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    databaseId: run.id,
    displayTitle: run.display_title,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    name: run.name,
    number: run.run_number,
    startedAt: run.started_at ?? null,
    status: run.status,
    updatedAt: run.updated_at,
    url: run.html_url,
    workflowDatabaseId: run.workflow_id,
    workflowName: run.name,
  };
}

export async function listRuns(params: ListRunsParams): Promise<ToolResult> {
  const limit = params.limit ?? 10;
  const queryParams: Record<string, string> = {
    per_page: String(limit),
  };

  if (params.branch) queryParams.branch = params.branch;
  if (params.status) queryParams.status = params.status;
  if (params.event) queryParams.event = params.event;
  if (params.commit)
    queryParams.head_sha = await resolveCommitSha(params.commit);
  if (params.user) queryParams.actor = params.user;

  try {
    // If a workflow filter is specified, resolve the identifier (display name,
    // filename, or numeric ID) and use the workflow-specific endpoint.
    const workflowId = params.workflow
      ? await resolveWorkflowId(params.workflow)
      : null;
    const path = workflowId
      ? `/actions/workflows/${encodeURIComponent(String(workflowId))}/runs`
      : '/actions/runs';

    const data = await githubGet<GitHubRunsResponse>(path, queryParams);
    const runs = data.workflow_runs.slice(0, limit).map(mapRun);

    if (runs.length === 0 && workflowId) {
      // The workflow name resolved to a real workflow, but the combination
      // with branch/commit/status/event matched nothing. Distinguish "no
      // runs at all for these filters" from "wrong workflow" by re-querying
      // without the workflow filter — if the branch/commit does have runs,
      // name the workflow(s) they actually belong to (LS-9589 AC3).
      const broader = await githubGet<GitHubRunsResponse>(
        '/actions/runs',
        queryParams,
      );
      if (broader.workflow_runs.length > 0) {
        const names = [
          ...new Set(broader.workflow_runs.map((r) => r.name)),
        ].slice(0, 5);
        return {
          content: [
            {
              type: 'text',
              text: `No workflow runs found for workflow "${params.workflow}" with these filters, but ${broader.workflow_runs.length} run(s) exist under other workflow(s) matching the same branch/commit/status/event: ${names.map((n) => `"${n}"`).join(', ')}. Did you mean one of these?`,
            },
          ],
        };
      }
    }

    return {
      content: [{ type: 'text', text: formatRunList(runs) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list workflow runs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
