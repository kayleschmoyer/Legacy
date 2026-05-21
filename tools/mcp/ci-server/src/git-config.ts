import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Read the URL of a remote directly from `.git/config`, avoiding `spawn git`.
 *
 * Some MCP server processes on Windows are launched without the Git
 * installation directory on PATH; `execFile('git', ...)` then fails with
 * `spawn git ENOENT`. Every `legacy-sports-ci` tool needs the origin URL
 * to resolve owner/repo, so a failure here cascades to every tool call
 * (LS-4599). Reading `.git/config` directly removes the dependency on a
 * resolvable `git` binary for the common case.
 *
 * Handles three layouts:
 *   1. Standard repo: `<repoRoot>/.git/` is a directory containing `config`.
 *   2. Linked worktree: `<repoRoot>/.git` is a file `gitdir: <path>`;
 *      the per-worktree `gitdir` has a `commondir` file pointing to the
 *      main gitdir which owns the shared `config`.
 *   3. Submodule (`gitdir:` plus no `commondir`): the per-submodule gitdir
 *      itself holds the `config`.
 */
export function readGitRemoteUrl(
  repoRoot: string,
  remoteName = 'origin',
): string | null {
  const gitDir = resolveGitDir(repoRoot);
  if (!gitDir) return null;
  try {
    const config = readFileSync(join(gitDir, 'config'), 'utf-8');
    return parseRemoteUrl(config, remoteName);
  } catch {
    return null;
  }
}

function resolveGitDir(repoRoot: string): string | null {
  const dotGit = join(repoRoot, '.git');
  let stat;
  try {
    stat = statSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) return dotGit;
  if (!stat.isFile()) return null;

  let pointer: string;
  try {
    pointer = readFileSync(dotGit, 'utf-8');
  } catch {
    return null;
  }
  const match = /^gitdir:\s*(.+)$/m.exec(pointer);
  if (!match) return null;
  const target = match[1].trim();
  const wtGitDir = isAbsolute(target) ? target : resolve(repoRoot, target);

  try {
    const commondir = readFileSync(join(wtGitDir, 'commondir'), 'utf-8').trim();
    return isAbsolute(commondir) ? commondir : resolve(wtGitDir, commondir);
  } catch {
    return wtGitDir;
  }
}

function parseRemoteUrl(config: string, remoteName: string): string | null {
  let inSection = false;
  for (const raw of config.split(/\r?\n/)) {
    const stripped = raw.replace(/[;#].*$/, '').trim();
    if (!stripped) continue;
    const sectionMatch = /^\[remote\s+"([^"]+)"\]$/.exec(stripped);
    if (sectionMatch) {
      inSection = sectionMatch[1] === remoteName;
      continue;
    }
    if (stripped.startsWith('[')) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const urlMatch = /^url\s*=\s*(.+)$/.exec(stripped);
      if (urlMatch) return urlMatch[1].trim();
    }
  }
  return null;
}
