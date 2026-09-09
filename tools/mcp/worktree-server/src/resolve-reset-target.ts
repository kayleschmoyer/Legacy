type RunGitFn = (
  args: string[],
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
) => string;

export interface ResetTargetVerification {
  /** True if the target SHA may be reset to. */
  allowed: boolean;
  /**
   * True only when `allowed` is true because the target was a non-ancestor
   * verified present in the branch's reflog (not because it was already an
   * ancestor of HEAD).
   */
  reflogVerifiedNonAncestor: boolean;
}

/**
 * Decides whether `worktree_reset` may reset to `targetSha`, per the
 * ancestor-only safety check plus its `allowNonAncestor` escape hatch.
 *
 * `git merge-base --is-ancestor` is the primary check. When it fails (the
 * target is not an ancestor of HEAD) and the caller passed
 * `allowNonAncestor: true`, the target is allowed anyway only if it is
 * verified present in this branch's reflog — i.e. a real prior HEAD position
 * (e.g. the pre-rebase tip before a rerere-corrupted rebase), not an
 * arbitrary/unrelated SHA. This preserves the "prevent accidental data loss"
 * intent of the original check while unblocking documented recovery flows.
 *
 * Never throws — a reflog lookup failure is treated as "not found" so it
 * falls through to refusal rather than crashing the reset flow.
 */
export function resolveResetTarget(
  targetSha: string,
  allowNonAncestor: boolean,
  cwd: string,
  runGit: RunGitFn,
): ResetTargetVerification {
  try {
    runGit(['merge-base', '--is-ancestor', targetSha, 'HEAD'], cwd);
    return { allowed: true, reflogVerifiedNonAncestor: false };
  } catch {
    // Not an ancestor — fall through to the reflog check below.
  }

  if (!allowNonAncestor) {
    return { allowed: false, reflogVerifiedNonAncestor: false };
  }

  let foundInReflog = false;
  try {
    const reflogShas = runGit(['reflog', 'show', '--format=%H', 'HEAD'], cwd, {
      timeout: 15_000,
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    foundInReflog = reflogShas.includes(targetSha);
  } catch {
    // Non-fatal — treat as not found, fall through to refusal.
    foundInReflog = false;
  }

  return {
    allowed: foundInReflog,
    reflogVerifiedNonAncestor: foundInReflog,
  };
}
