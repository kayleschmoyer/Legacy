/**
 * Resolve a `worktree_diff` base ref to the merge-base with HEAD.
 *
 * `git diff <base>` alone is a literal two-dot diff (base vs. working tree):
 * when the branch is behind `base`, that pulls in every unrelated change
 * merged upstream since the branch diverged, even though `worktree_status`
 * already computes the correct merge-base (`mergeBase.sha`). Resolving to
 * the merge-base first scopes the diff to only what changed on this branch
 * (LS-9304).
 */
export type RunGit = (
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
) => string;

/**
 * Returns the SHA of `git merge-base HEAD <base>`. Falls back to the raw
 * `base` ref if the merge-base lookup fails (e.g. unrelated histories, or
 * `base` doesn't exist locally) — the subsequent `git diff` call surfaces
 * the real git error in that case.
 */
export function resolveDiffBase(
  runGit: RunGit,
  base: string,
  cwd: string,
): string {
  try {
    const sha = runGit(['merge-base', 'HEAD', base], cwd, {
      timeout: 10_000,
    }).trim();
    return sha || base;
  } catch {
    return base;
  }
}
