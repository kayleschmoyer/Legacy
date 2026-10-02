import { githubRest } from '../github-api.js';

/**
 * Stale-base detection for CI triage (LS-10376).
 *
 * CI for a pull_request runs on `refs/pull/N/merge`, a snapshot of head merged
 * into base at trigger time. When the base branch has since moved, a failing
 * check may already be fixed on base — the right response is a rebase
 * (a fresh merge ref), not a code fix and not a rerun (a rerun replays the old
 * merge ref; see ci-server `merge-ref-staleness.ts`, LS-9638).
 */

export interface BaseDivergence {
  /** Commits on the base ref that the PR head does not contain. */
  behindBy: number;
  aheadBy: number;
  /** Merge base of base ref and PR head. */
  mergeBaseSha: string;
  /** Current tip of the base ref. */
  baseTipSha: string;
}

export interface StaleBaseHint {
  hint: 'STALE_BASE';
  behindBy: number;
  mergeBaseSha: string;
  baseTipSha: string;
  /** Failing PR checks that are green on the base tip (newer than the merge base). */
  greenOnBase: string[];
  /** Failing PR checks that are also red on the base tip (not fixable by rebasing). */
  failingOnBase: string[];
}

interface CompareResponse {
  behind_by: number;
  ahead_by: number;
  merge_base_commit: { sha: string };
  base_commit: { sha: string };
}

interface BaseCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface BaseCheckRunsPage {
  check_runs: BaseCheckRun[];
}

/**
 * Compare the base ref tip against the PR head. Fail-open: returns `null` on
 * any error — an advisory lookup must never break the triage tool it feeds.
 */
export async function fetchBaseDivergence(
  owner: string,
  repo: string,
  baseRefName: string,
  headSha: string,
): Promise<BaseDivergence | null> {
  try {
    const data = await githubRest<CompareResponse>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/compare/${encodeURIComponent(baseRefName)}...${headSha}`,
      query: { per_page: '1' },
    });
    return {
      behindBy: data.behind_by,
      aheadBy: data.ahead_by,
      mergeBaseSha: data.merge_base_commit.sha,
      baseTipSha: data.base_commit.sha,
    };
  } catch {
    return null;
  }
}

/** Strip the `(conclusion)` / `(state)` suffix evaluatePRChecks appends. */
function checkName(failingEntry: string): string {
  return failingEntry.replace(/\s\([^()]*\)$/, '');
}

/** Latest check-run per name at `sha`. */
async function fetchLatestRunsByName(
  owner: string,
  repo: string,
  sha: string,
): Promise<Map<string, BaseCheckRun>> {
  const byName = new Map<string, BaseCheckRun>();
  for (let page = 1; page <= 5; page++) {
    const data = await githubRest<BaseCheckRunsPage>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      query: { per_page: '100', page: String(page) },
    });
    for (const run of data.check_runs) {
      const existing = byName.get(run.name);
      if (!existing || run.id > existing.id) byName.set(run.name, run);
    }
    if (data.check_runs.length < 100) break;
  }
  return byName;
}

/**
 * STALE_BASE hint: the branch is behind its base AND at least one failing PR
 * check is green on the base tip, i.e. the base moved past the merge base and
 * the failure may already be fixed there. Returns `null` when the branch is
 * not behind, no failing check is green on base, or the lookup fails.
 */
export async function detectStaleBase(
  owner: string,
  repo: string,
  divergence: BaseDivergence,
  failingEntries: string[],
): Promise<StaleBaseHint | null> {
  if (divergence.behindBy < 1 || failingEntries.length === 0) return null;
  try {
    const onBase = await fetchLatestRunsByName(
      owner,
      repo,
      divergence.baseTipSha,
    );
    const greenOnBase: string[] = [];
    const failingOnBase: string[] = [];
    for (const name of new Set(failingEntries.map(checkName))) {
      const run = onBase.get(name);
      if (!run || run.status !== 'completed') continue;
      if (run.conclusion === 'success') greenOnBase.push(name);
      else if (run.conclusion !== 'skipped') failingOnBase.push(name);
    }
    if (greenOnBase.length === 0) return null;
    return {
      hint: 'STALE_BASE',
      behindBy: divergence.behindBy,
      mergeBaseSha: divergence.mergeBaseSha,
      baseTipSha: divergence.baseTipSha,
      greenOnBase,
      failingOnBase,
    };
  } catch {
    return null;
  }
}

export function staleBaseNextAction(
  baseRefName: string,
  hint: StaleBaseHint,
): string {
  return (
    `STALE_BASE: ${hint.greenOnBase.join(', ')} ${hint.greenOnBase.length === 1 ? 'is' : 'are'} green on ${baseRefName} ` +
    `(${hint.baseTipSha.slice(0, 12)}), ${hint.behindBy} commit${hint.behindBy === 1 ? '' : 's'} newer than this branch's merge base ` +
    `(${hint.mergeBaseSha.slice(0, 12)}). Rebase onto ${baseRefName} and push a real commit — do NOT rerun (a rerun replays the stale ` +
    `refs/pull/N/merge snapshot) and do not code-fix yet.`
  );
}
