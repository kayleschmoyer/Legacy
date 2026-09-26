export interface RerereAssessmentDeps {
  runShell: (cmd: string, cwd: string) => string;
  readFile: (path: string) => string;
  join: (...segments: string[]) => string;
}

export interface RerereAssessment {
  /** True only when it is safe for `worktree_rebase` to run `git rebase --continue`. */
  autoContinueSafe: boolean;
  /** Paths git still reports as unmerged (`git ls-files -u`). */
  unmergedPaths: string[];
  /** Paths rerere claimed in its `Resolved '<path>' using previous resolution.` output. */
  rerereResolvedPaths: string[];
  /** Paths that still contain raw conflict markers on disk. */
  markerPaths: string[];
  /** Unmerged paths rerere never claimed to have resolved. */
  unaccountedPaths: string[];
  /** Paths to `git add` before continuing — empty unless `autoContinueSafe`. */
  pathsToStage: string[];
  /** Human-readable explanation of the verdict, for the tool's log. */
  reason: string;
}

/**
 * Matches a raw conflict marker at the start of a line. Mirrors the anchored
 * convention in `conflict-markers.ts` so a `<<<<<<<` substring inside a string
 * literal or doc example is not mistaken for a real marker.
 */
const CONFLICT_MARKER_RE = /^(<{7}[ \t]|={7}\r?$|>{7}[ \t])/m;

/**
 * Extracts the paths rerere reported replaying a cached resolution for.
 * Git prints one `Resolved '<path>' using previous resolution.` line per file
 * it fully auto-resolved; a file rerere could not resolve gets no such line.
 */
export function parseRerereResolvedPaths(output: string): string[] {
  const re = /^\s*Resolved '(.+)' using previous resolution\.\s*$/gm;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(output)) !== null) {
    if (!paths.includes(match[1])) paths.push(match[1]);
  }
  return paths;
}

/**
 * Lists unmerged paths via `git ls-files -u`, which reports one line per
 * conflict stage (`<mode> <sha> <stage>\t<path>`); dedupes to one entry per
 * path. Unlike `git diff --diff-filter=U` this is read straight from the
 * index, but the critical property for both is that the caller must NOT have
 * run `git add` first — staging a conflicted file marks it resolved and makes
 * either check report a clean tree (LS-10254).
 */
export function listUnmergedPaths(
  cwd: string,
  deps: Pick<RerereAssessmentDeps, 'runShell'>,
): string[] {
  let raw: string;
  try {
    raw = deps.runShell('git ls-files -u', cwd);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const line of raw.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const path = line.slice(tab + 1).trim();
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/**
 * Decides whether `worktree_rebase` may auto-continue a rebase that stopped on
 * a conflict.
 *
 * The previous implementation ran `git add -u` and then checked
 * `git diff --name-only --diff-filter=U` for leftovers. Staging is exactly what
 * clears the unmerged flag, so that check could never fail: every genuine
 * conflict — including with `disableRerere: true`, where rerere never ran at
 * all — was reported as "rerere auto-resolved all conflicts" and committed with
 * its markers intact (LS-10254).
 *
 * This assessment stages nothing. Auto-continue is permitted only when all of:
 *   - rerere was actually enabled for this rebase;
 *   - rerere claimed at least one path via `Resolved '<path>' ...`;
 *   - every unmerged path is one of those claimed paths;
 *   - none of the affected files still contains a conflict marker on disk.
 */
export function assessRerereResolution(
  cwd: string,
  rebaseOutput: string,
  opts: { disableRerere: boolean },
  deps: RerereAssessmentDeps,
): RerereAssessment {
  const unmergedPaths = listUnmergedPaths(cwd, deps);

  if (opts.disableRerere) {
    return {
      autoContinueSafe: false,
      unmergedPaths,
      rerereResolvedPaths: [],
      markerPaths: [],
      unaccountedPaths: unmergedPaths,
      pathsToStage: [],
      reason:
        'disableRerere: true — rerere did not run, so there is no auto-resolution to trust. ' +
        'Not auto-continuing; these conflicts need manual resolution.',
    };
  }

  const rerereResolvedPaths = parseRerereResolvedPaths(rebaseOutput);
  const resolvedSet = new Set(rerereResolvedPaths);
  const unaccountedPaths = unmergedPaths.filter((p) => !resolvedSet.has(p));

  const candidates = [...unmergedPaths];
  for (const p of rerereResolvedPaths) {
    if (!candidates.includes(p)) candidates.push(p);
  }
  const markerPaths = candidates.filter((path) => {
    try {
      return CONFLICT_MARKER_RE.test(deps.readFile(deps.join(cwd, path)));
    } catch {
      // Deleted, binary, or unreadable — nothing to scan.
      return false;
    }
  });

  if (rerereResolvedPaths.length === 0) {
    return {
      autoContinueSafe: false,
      unmergedPaths,
      rerereResolvedPaths,
      markerPaths,
      unaccountedPaths,
      pathsToStage: [],
      reason:
        'rerere did not report replaying any cached resolution — these are genuine, ' +
        'unresolved conflicts. Not auto-continuing.',
    };
  }

  if (unaccountedPaths.length > 0) {
    return {
      autoContinueSafe: false,
      unmergedPaths,
      rerereResolvedPaths,
      markerPaths,
      unaccountedPaths,
      pathsToStage: [],
      reason:
        `rerere resolved ${rerereResolvedPaths.length} file(s) but ${unaccountedPaths.length} ` +
        `conflicted file(s) remain unmerged:\n${unaccountedPaths.join('\n')}\n` +
        'Not auto-continuing.',
    };
  }

  if (markerPaths.length > 0) {
    return {
      autoContinueSafe: false,
      unmergedPaths,
      rerereResolvedPaths,
      markerPaths,
      unaccountedPaths,
      pathsToStage: [],
      reason:
        'rerere reported success but conflict markers are still present in:\n' +
        `${markerPaths.join('\n')}\n` +
        'Its cached resolution is bad. Not auto-continuing — fix the markers manually, ' +
        'or retry with disableRerere: true after worktree_rerere_forget.',
    };
  }

  return {
    autoContinueSafe: true,
    unmergedPaths,
    rerereResolvedPaths,
    markerPaths,
    unaccountedPaths,
    pathsToStage: unmergedPaths,
    reason: `rerere replayed a cached resolution for ${rerereResolvedPaths.length} file(s), no conflict markers remain, and no other file is unmerged.`,
  };
}
