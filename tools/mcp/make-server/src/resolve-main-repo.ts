import { execSync } from 'node:child_process';

import { pathModuleFor } from './path-platform-utils.js';

/** Runs `git rev-parse --git-common-dir` and returns its raw stdout. */
export type GitCommonDirRunner = (cwd: string) => string;

function defaultRunGitCommonDir(cwd: string): string {
  return execSync('git rev-parse --git-common-dir', {
    cwd,
    encoding: 'utf-8',
    timeout: 5_000,
    windowsHide: true,
  });
}

/**
 * Resolve the main repo root from the given directory (works whether `cwd`
 * is the main repo or a `git worktree` checkout of it).
 *
 * `getRepoRoot()` previously derived the repo root from this server's own
 * `import.meta.url` — the location of the *running script*, not the caller's
 * intent. That is correct only when the make-server process happens to be
 * loaded from the main repo's own checkout. In a worktree session (native
 * ephemeral or sibling), the worktree has its own full copy of
 * `tools/mcp/make-server`, so a make-server spawned from within it resolves
 * to the *worktree's* path — not the main repo. `make worktree` then runs
 * `worktree-create.ps1` with that worktree as `cwd`, and the script's "main
 * repo must be on main" guard correctly reports the worktree's own feature
 * branch and refuses (LS-4802) — the check is not wrong, it's checking the
 * wrong directory.
 *
 * `git rev-parse --git-common-dir` answers "where is the main repo?" from
 * whichever checkout it's run in: `.git` in the main repo itself, or an
 * absolute path to the main repo's `.git` directory from any worktree of it.
 * That makes this resolution correct regardless of which checkout's copy of
 * the make-server happens to be running — the same technique already used by
 * `worktree_ping`'s `mainRepo` field (see `tools/mcp/worktree-server/src/resolve-main-repo.ts`).
 */
export function resolveMainRepoPath(
  cwd: string,
  runGitCommonDir: GitCommonDirRunner = defaultRunGitCommonDir,
): string {
  const gitCommonDir = runGitCommonDir(cwd).trim();
  // In the main repo this returns ".git"; in a worktree it returns the
  // absolute path to the main repo's .git directory.
  if (gitCommonDir === '.git') {
    return cwd;
  }
  // Select the path module by the shape of `gitCommonDir` rather than the
  // host OS: this keeps behavior deterministic for POSIX-style test fixtures
  // run on a Windows host, while real absolute paths still resolve exactly
  // as they did before (see path-platform-utils).
  return pathModuleFor(gitCommonDir).resolve(gitCommonDir, '..');
}
