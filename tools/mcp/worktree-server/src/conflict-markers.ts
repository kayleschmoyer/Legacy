type RunGitFn = (args: string[], cwd: string) => string;

/**
 * Returns paths of staged files that contain git conflict markers.
 * Uses `git grep --cached -l '<<<<<<<'` — exits 1 (throws) when no matches, which we treat as empty.
 */
export function scanStagedForConflictMarkers(
  cwd: string,
  runGit: RunGitFn,
): string[] {
  try {
    return runGit(['grep', '--cached', '-l', '<<<<<<<'], cwd)
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}
