type RunGitFn = (args: string[], cwd: string) => string;

export interface RerereForgetResult {
  cleared: string[];
  failed: string[];
}

/**
 * Clears the cached rerere resolution for each path. `git rerere forget`
 * only works while the file still carries conflict markers — once rerere has
 * already auto-applied its (bad) resolution, the file is clean and `forget`
 * fails to parse conflict hunks. In that case, reset the file to the
 * conflicted state first (`git checkout --merge`) and retry — this is the
 * only safe way to clear rerere for an already-resolved file, so it runs
 * unconditionally as the fallback rather than behind a flag.
 *
 * Never throws — per-path failures are collected into `failed` so one bad
 * path doesn't block clearing the rest.
 */
export function rerereForgetPaths(
  paths: string[],
  cwd: string,
  runGit: RunGitFn,
): RerereForgetResult {
  const cleared: string[] = [];
  const failed: string[] = [];

  for (const path of paths) {
    try {
      runGit(['rerere', 'forget', '--', path], cwd);
      cleared.push(path);
      continue;
    } catch {
      // Likely already auto-resolved (no conflict markers left to parse) —
      // fall through and retry after restoring the conflicted state.
    }

    try {
      runGit(['checkout', '--merge', '--', path], cwd);
      runGit(['rerere', 'forget', '--', path], cwd);
      cleared.push(path);
    } catch {
      failed.push(path);
    }
  }

  return { cleared, failed };
}
