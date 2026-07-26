export type CommitishResolution =
  | { ok: true; commitish: string }
  | { ok: false; error: string };

/**
 * Resolves the commit-ish argument for worktree_show_commit, which accepts
 * either `ref` (preferred, matches worktree_show_file / worktree_commit_stat /
 * worktree_show_remote) or `sha` (deprecated back-compat alias). `sha` wins
 * when both are provided.
 */
export function resolveCommitish(
  sha?: string,
  ref?: string,
): CommitishResolution {
  const commitish = sha ?? ref;
  if (!commitish) {
    return { ok: false, error: 'Missing required parameter: sha (or ref)' };
  }
  return { ok: true, commitish };
}
