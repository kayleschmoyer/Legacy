import { githubGet } from './github-api.js';

interface GitHubWorkflowRunInfo {
  head_sha: string;
  event: string;
  pull_requests?: Array<{ number: number }>;
}

interface GitHubPullRequestInfo {
  merge_commit_sha: string | null;
  state: string;
}

/**
 * Detect whether rerunning `runId` will replay a stale `refs/pull/N/merge`
 * snapshot instead of a live recompute against the PR's current base
 * (LS-9638). GitHub's rerun/rerun-failed-jobs endpoints reschedule jobs
 * against the run's already-checked-out ref — for a pull_request-triggered
 * run that ref is the merge commit GitHub computed against the base branch
 * *at the time the run was first triggered*. If the base has since moved,
 * the rerun still validates against that old merge snapshot, silently
 * reproducing a since-fixed failure (or missing a since-introduced one)
 * rather than picking up the current base.
 *
 * Returns a warning string when the run's `head_sha` no longer matches the
 * PR's current `merge_commit_sha`, or `null` when the run isn't
 * pull_request-triggered, the PR is no longer open, or the check itself
 * fails for any reason — this is an advisory lookup only and must never
 * block or fail the rerun it's attached to (mirrors the fail-open pattern
 * of `hasCancelledDependencyJobs` in rerun.ts).
 */
export async function checkStaleMergeRef(
  runId: number,
): Promise<string | null> {
  try {
    const run = await githubGet<GitHubWorkflowRunInfo>(
      `/actions/runs/${runId}`,
    );
    if (run.event !== 'pull_request' || !run.pull_requests?.length) {
      return null;
    }

    const prNumber = run.pull_requests[0].number;
    const pr = await githubGet<GitHubPullRequestInfo>(`/pulls/${prNumber}`);
    if (pr.state !== 'open' || !pr.merge_commit_sha) return null;
    if (pr.merge_commit_sha === run.head_sha) return null;

    return (
      `This rerun replays run ${runId}'s original refs/pull/${prNumber}/merge snapshot ` +
      `(${run.head_sha.slice(0, 12)}), not a live recompute against the PR's current base — ` +
      `GitHub's rerun endpoints reschedule jobs against the already-checked-out ref rather than ` +
      `re-resolving refs/pull/${prNumber}/merge. The PR's current merge commit is ` +
      `${pr.merge_commit_sha.slice(0, 12)}, so if the original failure came from something on the ` +
      `base branch (not this PR's diff), this rerun will very likely reproduce the same stale failure. ` +
      `To force a fresh run against the current base, push a real commit (e.g. merge/rebase the base ` +
      `branch into this one) or dispatch a new workflow run instead.`
    );
  } catch {
    return null;
  }
}
