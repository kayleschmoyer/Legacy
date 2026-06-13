/**
 * Required-status-check evaluation, ported from the merge-queue processor.
 *
 * The merge-queue processor (`.github/scripts/merge-queue-processor.js`,
 * `validateStatusChecks` + `getRequiredChecks`) is the canonical, correct reader
 * of a PR's merge-gate state. Historically the MCP triage tools
 * (`github_pr_dashboard`, `github_pr_why_blocked`) re-derived CI state from
 * GitHub's GraphQL `statusCheckRollup`, which:
 *   1. counts EVERY check posted to the head SHA, including non-required ones
 *      (`🔐 SHA Sanity Check`, `review`, `Summarize & Report`, …), and
 *   2. double-counts stale/cancelled duplicate runs left behind by
 *      `concurrency: cancel-in-progress` (e.g. `No Merge Conflicts ×2`).
 * The result was fully-green PRs reported as `CI_FAILING` — the false-red triage
 * signal LS-7993 fixes.
 *
 * This module is the SINGLE place both tools evaluate required-check state, so
 * they cannot drift from the processor again. It mirrors the processor's three
 * rules exactly:
 *   1. Filter check runs to the names branch protection actually requires
 *      (classic protection + repository ruleset via
 *      `GET /repos/{owner}/{repo}/rules/branches/{branch}`).
 *   2. Deduplicate to the latest-completed-run-per-name (a later success
 *      supersedes an earlier cancelled run).
 *   3. Evaluate commit statuses (e.g. `bot-review`, a Statuses-API status, not a
 *      check run) alongside check runs.
 *
 * NOTE: this operates on REST API shapes (lowercase `status`/`conclusion`/`state`
 * values like the processor), NOT GraphQL `statusCheckRollup` enums. Keep the two
 * worlds separate — REST is the source of truth here because only it exposes the
 * per-run timestamps needed to pick the latest run, and the ruleset endpoint that
 * lists required check names.
 */

import { githubRest } from './github-api.js';

// Mirrors EXCLUDED_CHECKS in .github/scripts/merge-queue-processor.js:
// process-merge-queue is the merge queue itself (circular); delayed-recheck is a
// housekeeping job, not a quality gate.
export const EXCLUDED_CHECK_NAMES = new Set([
  'process-merge-queue',
  'delayed-recheck',
]);

// Mirrors LIGHTWEIGHT_CHECK_NAMES in the processor. These auto-register on every
// push before the CI Pipeline starts, so their presence alone must not satisfy
// the "CI has started" guard when no required checks are configured (LS-4111).
const LIGHTWEIGHT_CHECK_NAMES = new Set([
  '🔐 SHA Sanity Check',
  'No Merge Conflicts',
  'Sync Jira Ticket',
]);

// ── REST shapes ───────────────────────────────────────────────────────────────

/** Subset of the Checks API check-run object used for evaluation. */
export interface RestCheckRun {
  name: string;
  /** 'queued' | 'in_progress' | 'completed' */
  status: string;
  /** 'success' | 'failure' | 'cancelled' | 'timed_out' | 'skipped' | 'neutral' | 'action_required' | null */
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/** Subset of the Statuses API commit-status object used for evaluation. */
export interface RestCommitStatus {
  context: string;
  /** 'success' | 'failure' | 'error' | 'pending' */
  state: string;
  created_at: string;
}

/**
 * Outcome of evaluating a SHA's required checks. `failing`/`pending` carry the
 * processor-style `name (reason)` strings for human-readable triage; `passing` is
 * the count of required checks/statuses that are green (or non-blocking, e.g.
 * skipped/neutral). `hadDuplicateRuns` is true when at least one required check
 * name had more than one run on the SHA (i.e. stale duplicates were deduped) —
 * the dashboard surfaces this so triagers know batch-status detail exists.
 */
export interface CIPartition {
  failing: string[];
  pending: string[];
  passing: number;
  hadDuplicateRuns: boolean;
}

// ── Required-check name resolution ────────────────────────────────────────────

interface ClassicBranchProtection {
  required_status_checks?: {
    contexts?: string[];
    checks?: Array<{ context: string }>;
  } | null;
}

interface BranchRule {
  type: string;
  parameters?: {
    required_status_checks?: Array<{ context: string }>;
  };
}

interface CheckRunsPage {
  total_count: number;
  check_runs: RestCheckRun[];
}

// Cache required check names per `owner/repo#branch` — branch protection rarely
// changes within an MCP session, and the dashboard evaluates many PRs that share
// a base branch. Mirrors the processor's `requiredChecksCache`.
const requiredChecksCache = new Map<string, Set<string> | null>();

/**
 * Resolve the set of check names branch protection requires for `branch`,
 * combining classic branch protection and repository ruleset required checks
 * (the primary source for the CI Pipeline composite checks). Returns `null` when
 * neither source yields any required check — callers then fall back to evaluating
 * all checks, exactly as the processor does.
 */
export async function getRequiredCheckNames(
  owner: string,
  repo: string,
  branch: string,
): Promise<Set<string> | null> {
  const cacheKey = `${owner}/${repo}#${branch}`;
  const cached = requiredChecksCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const names = new Set<string>();
  const encodedBranch = encodeURIComponent(branch);

  // Classic branch protection required checks (404 when absent; 403 without admin).
  try {
    const bp = await githubRest<ClassicBranchProtection>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/branches/${encodedBranch}/protection`,
    });
    const rsc = bp.required_status_checks;
    if (rsc) {
      for (const ctx of rsc.contexts ?? []) names.add(ctx);
      for (const c of rsc.checks ?? []) names.add(c.context);
    }
  } catch {
    // No classic protection / no admin access — both acceptable; rely on ruleset.
  }

  // Repository ruleset required checks — the primary source for the CI Pipeline
  // composite checks that classic branch protection does not surface.
  try {
    const branchRules = await githubRest<BranchRule[]>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/rules/branches/${encodedBranch}`,
    });
    for (const rule of branchRules) {
      if (
        rule.type === 'required_status_checks' &&
        rule.parameters?.required_status_checks
      ) {
        for (const check of rule.parameters.required_status_checks) {
          names.add(check.context);
        }
      }
    }
  } catch {
    // Ruleset read failed — fall back to classic branch protection checks only.
  }

  const result = names.size > 0 ? names : null;
  requiredChecksCache.set(cacheKey, result);
  return result;
}

/** Clear the cached required-check names (test seam / long-lived process reuse). */
export function clearRequiredChecksCache(): void {
  requiredChecksCache.clear();
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchCheckRuns(
  owner: string,
  repo: string,
  sha: string,
): Promise<RestCheckRun[]> {
  const all: RestCheckRun[] = [];
  let page = 1;
  // Paginate — popular SHAs accumulate >100 runs (reruns, scans). Required
  // checks living on later pages would otherwise appear absent. See LS-4672.
  for (;;) {
    const pageData = await githubRest<CheckRunsPage>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      query: { per_page: '100', page: String(page) },
    });
    all.push(...pageData.check_runs);
    if (
      all.length >= pageData.total_count ||
      pageData.check_runs.length === 0
    ) {
      break;
    }
    page++;
  }
  return all;
}

async function fetchCommitStatuses(
  owner: string,
  repo: string,
  sha: string,
): Promise<RestCommitStatus[]> {
  const all: RestCommitStatus[] = [];
  const perPage = 100;
  let page = 1;
  for (;;) {
    const pageStatuses = await githubRest<RestCommitStatus[]>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${sha}/statuses`,
      query: { per_page: String(perPage), page: String(page) },
    });
    all.push(...pageStatuses);
    if (pageStatuses.length < perPage) break;
    page++;
  }
  return all;
}

// ── Pure evaluation (mirrors processor `validateStatusChecks`) ────────────────

/**
 * Partition a SHA's check runs and commit statuses into failing / pending /
 * passing relative to the required checks. Pure — all I/O happens in the callers.
 *
 * @param requiredCheckNames Names branch protection requires, or `null` to
 *   evaluate all (non-required checks are excluded only when this is non-null).
 */
export function evaluateRequiredChecks(
  checkRuns: RestCheckRun[],
  commitStatuses: RestCommitStatus[],
  requiredCheckNames: Set<string> | null,
): CIPartition {
  const failing: string[] = [];
  const pending: string[] = [];
  let passing = 0;

  // 1. Keep only evaluable check runs: never the excluded jobs, and — when a
  //    required set is known — only required names. This is what stops
  //    non-required checks (review, Summarize & Report, …) being counted.
  const filtered = checkRuns.filter((c) => {
    if (EXCLUDED_CHECK_NAMES.has(c.name)) return false;
    if (requiredCheckNames !== null && !requiredCheckNames.has(c.name)) {
      return false;
    }
    return true;
  });

  // 2. Deduplicate by name, keeping the most recent completed run. This is what
  //    stops a stale `cancelled` duplicate blocking when a later run succeeded.
  const latestByName = new Map<string, RestCheckRun>();
  let duplicateCount = 0;
  for (const c of filtered) {
    const existing = latestByName.get(c.name);
    if (!existing) {
      latestByName.set(c.name, c);
      continue;
    }
    duplicateCount++;
    const cTime = new Date(c.completed_at ?? c.started_at ?? 0).getTime();
    const existingTime = new Date(
      existing.completed_at ?? existing.started_at ?? 0,
    ).getTime();
    if (cTime > existingTime) latestByName.set(c.name, c);
  }
  const relevantChecks = [...latestByName.values()];

  // Deduplicate commit statuses — keep the latest per context.
  const latestStatusByContext = new Map<string, RestCommitStatus>();
  for (const s of commitStatuses) {
    const existing = latestStatusByContext.get(s.context);
    if (
      !existing ||
      new Date(s.created_at).getTime() > new Date(existing.created_at).getTime()
    ) {
      latestStatusByContext.set(s.context, s);
    }
  }

  // 3. Required checks that have not posted any run/status yet → pending.
  if (requiredCheckNames !== null) {
    const postedNames = new Set<string>([
      ...relevantChecks.map((c) => c.name),
      ...latestStatusByContext.keys(),
    ]);
    for (const reqName of requiredCheckNames) {
      if (!postedNames.has(reqName)) {
        pending.push(`${reqName} (not yet registered)`);
      }
    }
  } else {
    // No required checks configured — guard against CI not having started at all.
    // Lightweight checks register before the CI Pipeline, so exclude them when
    // deciding whether any "real" check has appeared (LS-4111).
    const hasNonLightweightCheck = relevantChecks.some(
      (c) => !LIGHTWEIGHT_CHECK_NAMES.has(c.name),
    );
    if (!hasNonLightweightCheck) {
      pending.push('CI checks not yet registered for this SHA');
    }
  }

  // Classify the deduplicated check runs.
  for (const check of relevantChecks) {
    if (check.status === 'completed' && check.conclusion !== 'success') {
      if (
        check.conclusion === 'failure' ||
        check.conclusion === 'cancelled' ||
        check.conclusion === 'timed_out'
      ) {
        failing.push(`${check.name} (${check.conclusion})`);
      } else {
        // skipped / action_required / neutral are not failures.
        passing++;
      }
    } else if (check.status !== 'completed') {
      pending.push(`${check.name} (${check.status})`);
    } else {
      // completed + success
      passing++;
    }
  }

  // Classify the deduplicated commit statuses (required contexts only).
  for (const status of latestStatusByContext.values()) {
    if (
      requiredCheckNames !== null &&
      !requiredCheckNames.has(status.context)
    ) {
      continue;
    }
    if (status.state === 'failure' || status.state === 'error') {
      failing.push(`${status.context} (${status.state})`);
    } else if (status.state === 'pending') {
      pending.push(`${status.context} (pending)`);
    } else {
      // success
      passing++;
    }
  }

  return {
    failing,
    pending,
    passing,
    hadDuplicateRuns: duplicateCount > 0,
  };
}

/**
 * Evaluate a PR head SHA's required-check state end-to-end: resolve the required
 * check names for the base branch, fetch the SHA's check runs and commit
 * statuses, and partition them. This is the one entry point shared by
 * `github_pr_dashboard` and `github_pr_why_blocked`.
 */
export async function evaluatePRChecks(
  owner: string,
  repo: string,
  sha: string,
  baseBranch: string,
): Promise<CIPartition> {
  const [requiredCheckNames, checkRuns, commitStatuses] = await Promise.all([
    getRequiredCheckNames(owner, repo, baseBranch),
    fetchCheckRuns(owner, repo, sha),
    fetchCommitStatuses(owner, repo, sha),
  ]);
  return evaluateRequiredChecks(checkRuns, commitStatuses, requiredCheckNames);
}
