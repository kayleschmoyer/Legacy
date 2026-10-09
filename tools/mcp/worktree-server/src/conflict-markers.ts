import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type RunGitFn = (args: string[], cwd: string) => string;
type RunShellFn = (cmd: string, cwd: string) => string;

/**
 * Returns paths of staged files that contain git conflict markers.
 * Uses `git grep --cached -l -E '^<<<<<<<'`, anchored to the start of a line
 * (the same convention as `scanWorkingTreeForConflictMarkers` below and
 * `getConflictInfo`'s own line-based parsing) so a `<<<<<<<` substring inside
 * a string literal, comment, or doc example isn't mistaken for a real
 * conflict marker. Exits 1 (throws) when no matches, which we treat as empty.
 *
 * When `paths` is given, only those files are scanned (an empty list scans
 * nothing). Callers pass the files the replayed commits modified so docs that
 * arrive via the rebase base and legitimately contain marker examples are not
 * flagged (LS-10282).
 */
export function scanStagedForConflictMarkers(
  cwd: string,
  runGit: RunGitFn,
  paths?: string[],
): string[] {
  if (paths && paths.length === 0) return [];
  try {
    return runGit(
      [
        'grep',
        '--cached',
        '-l',
        '-E',
        '^<<<<<<<',
        ...(paths ? ['--', ...paths] : []),
      ],
      cwd,
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Files modified by the commits a just-finished rebase replayed: the diff from
 * the fork point (merge-base of the pre-rebase tip `ORIG_HEAD` and `HEAD`) to
 * `ORIG_HEAD`. Files that only arrived via the new base are excluded.
 * Returns null when this can't be determined, so callers fall back to a full
 * scan rather than silently skipping detection.
 */
export function listReplayedCommitFiles(
  cwd: string,
  runGit: RunGitFn,
): string[] | null {
  try {
    const forkPoint = runGit(['merge-base', 'ORIG_HEAD', 'HEAD'], cwd).trim();
    if (!forkPoint) return null;
    return runGit(
      ['diff', '--name-only', '--diff-filter=d', '-z', forkPoint, 'ORIG_HEAD'],
      cwd,
    )
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
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
