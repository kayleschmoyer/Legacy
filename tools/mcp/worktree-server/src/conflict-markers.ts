import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type RunGitFn = (args: string[], cwd: string) => string;
type RunShellFn = (cmd: string, cwd: string) => string;

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

export interface ConflictRange {
  startLine: number;
  separatorLine: number;
  endLine: number;
  oursPreview: string;
  theirsPreview: string;
}

export interface ConflictedFile {
  path: string;
  conflicts: ConflictRange[];
}

/**
 * Fallback scan for conflict markers baked into working-tree files that git
 * no longer considers unmerged — e.g. rerere auto-completed a rebase/merge
 * with a bad cached resolution, committing the literal markers instead of a
 * real fix. `git diff --diff-filter=U` only reports files the index still
 * marks unmerged, so it misses this case entirely. Only invoked when that
 * scan finds nothing.
 */
export function scanWorkingTreeForConflictMarkers(
  cwd: string,
  run: RunShellFn,
): string[] {
  try {
    return run("git grep -l -E '^(<<<<<<<|=======|>>>>>>>)'", cwd)
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Lists unmerged (conflicted) files with conflict-marker line ranges and
 * previews of each side. Works off `git diff --diff-filter=U`, so it applies
 * equally to conflicts left mid-rebase or mid-merge — used by both
 * `worktree_conflict_info` and `worktree_merge_main`'s conflict report so the
 * two report identically-shaped conflict info. Falls back to a working-tree
 * marker scan when git reports no unmerged files, so a rerere auto-completed
 * rebase/merge that baked bad markers into otherwise "clean" files still
 * surfaces them (see `scanWorkingTreeForConflictMarkers`).
 */
export function getConflictInfo(
  cwd: string,
  run: RunShellFn,
): { files: ConflictedFile[] } {
  const rawConflicts = run('git diff --name-only --diff-filter=U -z', cwd);
  let conflictedPaths = rawConflicts.split('\0').filter(Boolean);
  if (conflictedPaths.length === 0) {
    conflictedPaths = scanWorkingTreeForConflictMarkers(cwd, run);
  }
  const files: ConflictedFile[] = [];
  for (const filePath of conflictedPaths) {
    const fullPath = join(cwd, filePath);
    if (!existsSync(fullPath)) {
      files.push({ path: filePath, conflicts: [] });
      continue;
    }
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const conflicts: ConflictRange[] = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<')) {
        const startLine = i + 1;
        const oursLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('=======')) {
          oursLines.push(lines[i]);
          i++;
        }
        const separatorLine = i + 1;
        i++;
        const theirsLines: string[] = [];
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          theirsLines.push(lines[i]);
          i++;
        }
        const endLine = i + 1;
        const preview = (arr: string[]) => {
          const suffix =
            arr.length > 3 ? `\n... (${arr.length} lines total)` : '';
          const maxContent = 200 - suffix.length;
          return arr.slice(0, 3).join('\n').slice(0, maxContent) + suffix;
        };
        conflicts.push({
          startLine,
          separatorLine,
          endLine,
          oursPreview: preview(oursLines),
          theirsPreview: preview(theirsLines),
        });
      }
      i++;
    }
    files.push({ path: filePath, conflicts });
  }
  return { files };
}
