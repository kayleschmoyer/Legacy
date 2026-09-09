import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface DetectDirectBranchCcrCwdOptions {
  /** The server process's current working directory. */
  cwd: string;
  /** The resolved main repo root (see `resolveMainRepoPath`). */
  mainRepo: string;
  /** Whether this session is a Claude Code Remote (CCR) session. */
  isCcrEnv: boolean;
  /** Injectable for testing; defaults to `node:fs`'s `existsSync`. */
  pathExists?: (path: string) => boolean;
}

/**
 * Detect a Claude Code Remote (CCR) direct-branch session (LS-9819): the
 * session's `CLAUDE_CODE_REMOTE=true` and the server's CWD is exactly the
 * main repo root — a plain checkout at the session root, not a registered
 * `.claude/worktrees/<name>` tree.
 *
 * CCR sessions have no worktree concept: the repo is checked out directly on
 * the ticket branch, so the checkout itself is the only valid target. Prior
 * to this fix, every CCR session had to discover and call
 * `worktree_set(key: "<repo root abs path>")` manually before any other
 * `worktree_*` tool would work — `resolveWorktreePath`'s absolute-path
 * branch already accepts the main repo root for exactly this reason, but
 * nothing applied it automatically. This mirrors `detectEphemeralWorktreeCwd`,
 * which does the equivalent auto-detection for the native launcher-worktree
 * case (CWD under `.claude/worktrees/<name>`).
 *
 * Gated on `CLAUDE_CODE_REMOTE=true` so local sessions running from the main
 * repo root before any worktree exists are unaffected.
 *
 * Returns the resolved repo root to use as the active worktree, or `null` if
 * this isn't a direct-branch CCR session.
 */
export function detectDirectBranchCcrCwd({
  cwd,
  mainRepo,
  isCcrEnv,
  pathExists = existsSync,
}: DetectDirectBranchCcrCwdOptions): string | null {
  if (!isCcrEnv) return null;
  const resolvedCwd = resolve(cwd);
  if (resolvedCwd !== resolve(mainRepo)) return null;
  if (!pathExists(join(resolvedCwd, '.git'))) return null;
  return resolvedCwd;
}
