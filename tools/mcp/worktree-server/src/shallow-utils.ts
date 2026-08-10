// ---------------------------------------------------------------------------
// Pure helpers for detecting and recovering from an insufficiently shallow
// git clone before a new worktree is created from it.
//
// Mirrors the deepen → verify → unshallow sequence in .claude/cloud-setup.sh
// (LS-8113), applied at worktree-creation time instead of session start so a
// worktree never inherits stale/insufficient history (LS-9232).
// ---------------------------------------------------------------------------

/** Collaborator the shallow-depth checks need from index.ts. */
export interface ShallowDeps {
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string;
}

/** True when `cwd` is a shallow clone (`git rev-parse --is-shallow-repository`). */
export function isShallowRepository(deps: ShallowDeps, cwd: string): boolean {
  try {
    return (
      deps.runGit(['rev-parse', '--is-shallow-repository'], cwd).trim() ===
      'true'
    );
  } catch {
    // Not a git repo, or the check itself failed — treat as "not shallow" so
    // callers don't spend time deepening something they can't diagnose.
    return false;
  }
}

/** True when a merge-base between `ref` and HEAD is computable in `cwd`. */
export function hasMergeBase(
  deps: ShallowDeps,
  cwd: string,
  ref: string,
): boolean {
  try {
    deps.runGit(['merge-base', ref, 'HEAD'], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deepen `cwd` when it is a shallow clone, so history against `baseRef`
 * (default `origin/main`) exists before a worktree is created from it.
 *
 * Shallow clones don't self-heal on a plain `git fetch` — the shallow
 * boundary only moves with an explicit `--deepen`/`--unshallow`. Skipping
 * this step is what let LS-9206's worktree read stale native-file content:
 * `git worktree add` happily creates a worktree from history that predates
 * recently merged commits, with no error to signal the gap.
 *
 * Returns human-readable log lines describing what happened (empty when the
 * repo was already full/deep enough) — no exceptions escape; every git
 * failure downgrades to a warning line so worktree creation can proceed.
 */
export function ensureSufficientDepth(
  deps: ShallowDeps,
  cwd: string,
  baseRef = 'origin/main',
): string[] {
  const log: string[] = [];
  if (!isShallowRepository(deps, cwd)) {
    return log;
  }

  log.push(
    'Shallow clone detected — deepening to establish merge-base with ' +
      `${baseRef}...`,
  );
  try {
    deps.runGit(['fetch', '--deepen=200', 'origin', 'main'], cwd, {
      timeout: 60_000,
    });
  } catch (err) {
    log.push(
      `Deepen fetch warning (continuing): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (hasMergeBase(deps, cwd, baseRef)) {
    log.push('Merge-base established after deepen.');
    return log;
  }

  log.push('Deepen insufficient — attempting --unshallow...');
  try {
    deps.runGit(['fetch', '--unshallow', 'origin'], cwd, {
      timeout: 120_000,
    });
    log.push(
      hasMergeBase(deps, cwd, baseRef)
        ? 'Merge-base established after unshallow.'
        : 'WARNING: merge-base still unavailable after unshallow.',
    );
  } catch (err) {
    log.push(
      `WARNING: --unshallow failed (continuing): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return log;
}
