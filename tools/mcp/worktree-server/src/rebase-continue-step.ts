export interface RebaseContinueDeps {
  runGit: (
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => string;
  runShell: (cmd: string, cwd: string) => string;
  existsSync: (path: string) => boolean;
  join: (...segments: string[]) => string;
}

export interface RebaseContinueResult {
  completed: boolean;
  conflicted: string[];
}

/**
 * Perform a single rebase-continue step: stage files, run `git rebase --continue`
 * with a non-interactive editor, and return structured state. Shared by
 * `worktree_rebase` (auto-continue loop) and `worktree_rebase_continue` tool.
 *
 * `env` carries the caller's rerere.enabled override (see LS-8112 / LS-8593):
 * each `--continue` step is its own git process, so a `disableRerere` override
 * applied to the original `git rebase` invocation must be re-applied here too,
 * not just on the first call — the caller is responsible for passing the same
 * `env` it used to start the rebase on every subsequent continue step.
 */
export function rebaseContinueStep(
  cwd: string,
  env: Record<string, string>,
  deps: RebaseContinueDeps,
  files?: string[],
): RebaseContinueResult {
  const { runGit, runShell, existsSync, join } = deps;

  const getConflictedFiles = (): string[] => {
    try {
      return runShell('git diff --name-only --diff-filter=U', cwd)
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  // Stage resolved files
  if (files && files.length > 0) {
    runGit(['add', '--', ...files], cwd);
  } else {
    runGit(['add', '-A'], cwd);
  }

  // Continue rebase — may throw if new conflicts arise.
  runGit(['rebase', '--continue'], cwd, {
    timeout: 120_000,
    env,
  });

  // Check if rebase is still in progress
  const gitDir = runShell('git rev-parse --absolute-git-dir', cwd).trim();
  const stillRebasing =
    existsSync(join(gitDir, 'rebase-merge')) ||
    existsSync(join(gitDir, 'rebase-apply'));

  if (!stillRebasing) {
    return { completed: true, conflicted: [] };
  }

  // Still rebasing — check for new conflicts
  const conflictedFiles = getConflictedFiles();
  return { completed: false, conflicted: conflictedFiles };
}
