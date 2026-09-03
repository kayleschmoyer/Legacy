export interface ResolveCommitArgsOptions {
  amend: boolean;
  // Path to a file containing the commit message, passed via `-F`. Omit for
  // an amend that keeps the existing message (`--no-edit`); required for a
  // new (non-amend) commit.
  msgPath?: string;
  resetAuthor?: boolean;
  allowEmpty?: boolean;
}

// Builds the `git commit` argv for worktree_commit's three commit shapes
// (new commit, amend with a new message, amend keeping the existing
// message), applying --reset-author and --allow-empty consistently across
// all three so the pass-through flags can be unit-tested independent of the
// git/filesystem side effects in the surrounding handler.
export function resolveCommitArgs(opts: ResolveCommitArgsOptions): string[] {
  const { amend, msgPath, resetAuthor, allowEmpty } = opts;
  const args: string[] = ['commit'];
  if (amend) {
    args.push('--amend');
    args.push(...(msgPath ? ['-F', msgPath] : ['--no-edit']));
  } else {
    args.push('-F', msgPath as string);
  }
  if (resetAuthor) args.push('--reset-author');
  if (allowEmpty) args.push('--allow-empty');
  return args;
}
