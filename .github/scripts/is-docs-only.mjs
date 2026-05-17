/**
 * Returns true when every changed file in the diff matches a docs-only pattern
 * (paths under `docs/` or any `*.md` file). Used by the
 * `docs-only-required-checks` workflow to decide whether to short-circuit the
 * 5 required CI Pipeline sub-checks with synthetic success check-runs so
 * docs-only PRs are not deadlocked in the merge queue (LS-4478).
 *
 * Empty input returns false: "no diff" means we shouldn't fabricate green
 * statuses — let the normal pipeline (or its absence) drive merge gating.
 *
 * @param {string[]} changedFiles - List of paths from `git diff --name-only`.
 * @returns {boolean}
 */
export function isDocsOnly(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return false;
  return changedFiles.every((p) => {
    if (typeof p !== 'string') return false;
    const trimmed = p.trim();
    if (trimmed === '') return false;
    return trimmed.startsWith('docs/') || trimmed.endsWith('.md');
  });
}

/**
 * Parses raw `git diff --name-only` stdout into a deduplicated, trimmed array
 * of paths with blank lines removed.
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function parseChangedFiles(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const seen = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t !== '') seen.add(t);
  }
  return Array.from(seen);
}
