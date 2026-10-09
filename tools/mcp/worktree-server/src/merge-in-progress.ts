// Parses `git diff --name-only --diff-filter=U` output into the list of paths
// that still have unresolved merge conflicts.
export function parseUnmergedPaths(output: string): string[] {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Decides whether worktree_commit may proceed while MERGE_HEAD exists.
// Returns null when the commit may conclude the merge (no unmerged paths left)
// and a refusal message otherwise. `amend` is always refused mid-merge: it
// would rewrite the pre-merge tip instead of concluding the merge.
export function mergeCommitRefusal(
  unmergedPaths: string[],
  amend: boolean,
): string | null {
  if (unmergedPaths.length > 0) {
    return (
      `Refused: merge is in progress and ${unmergedPaths.length} path(s) still have unresolved conflicts:\n` +
      unmergedPaths.map((p) => `  - ${p}`).join('\n') +
      '\nResolve them, then retry worktree_commit — or abort with worktree_run(command: "git merge --abort").'
    );
  }
  if (amend) {
    return 'Refused: cannot amend while a merge is in progress. Run worktree_commit without amend to conclude the merge first.';
  }
  return null;
}
