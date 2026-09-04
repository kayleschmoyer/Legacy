import { execSync } from 'node:child_process';

import { pathModuleFor } from './path-platform-utils';

/** Runs `git rev-parse --git-common-dir` and returns its raw stdout. */
export type GitCommonDirRunner = () => string;

function defaultRunGitCommonDir(): string {
  return execSync('git rev-parse --git-common-dir', {
    encoding: 'utf-8',
    timeout: 5_000,
    windowsHide: true,
  });
}

/** Blocks the event loop for `ms` — only acceptable during one-time startup. */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Resolve the main repo root (works from both main repo and worktrees),
 * retrying on failure.
 *
 * This server is spawned by the Claude Code launcher's "worktree" checkbox at
 * the same moment `git worktree add` registers the new worktree. That's a
 * startup race: `git rev-parse --git-common-dir` can transiently fail before
 * the worktree's `.git` file and the main repo's `.git/worktrees/<name>` entry
 * are fully in place. No sibling MCP server in this repo runs git at import
 * time, so none of them are exposed to this race — but here, an unhandled
 * throw crashes the whole module before `server.connect()` is ever reached,
 * which is indistinguishable, from the client's side, from a server that
 * never connects (LS-8351, regression of LS-3716).
 */
export function resolveMainRepoPath(
  runGitCommonDir: GitCommonDirRunner = defaultRunGitCommonDir,
  retryDelaysMs: readonly number[] = [200, 500, 1000],
): string {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) sleepSync(retryDelaysMs[attempt - 1]);
    try {
      const gitCommonDir = runGitCommonDir().trim();
      // In the main repo this returns ".git"; in a worktree it returns the
      // absolute path to the main repo's .git directory.
      if (gitCommonDir === '.git') {
        return process.cwd();
      }
      // Select the path module by the shape of `gitCommonDir` rather than
      // the host OS: this keeps behavior deterministic for POSIX-style test
      // fixtures run on a Windows host, while real absolute paths still
      // resolve exactly as they did before (see path-platform-utils).
      return pathModuleFor(gitCommonDir).resolve(gitCommonDir, '..');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
