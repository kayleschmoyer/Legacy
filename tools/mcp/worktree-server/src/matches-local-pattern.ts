/**
 * Matcher for `worktree_list`'s local-mode `pattern` filter (LS-9815).
 *
 * A pattern with no glob wildcards is treated as a case-insensitive substring
 * match against any of the given fields (e.g. `pattern: "LS-9782"` matches a
 * branch like `claude/LS-9782-worktree-name`). A pattern containing `*`/`?`
 * is compiled to a case-insensitive glob matched against the full value of
 * each field (e.g. `pattern: "*serene-planck*"`).
 *
 * Callers must pre-validate `pattern` against the shared safe-glob-chars
 * regex before calling this — it does not re-validate.
 */
export function matchesLocalPattern(
  pattern: string,
): (...fields: string[]) => boolean {
  if (!/[*?]/.test(pattern)) {
    const needle = pattern.toLowerCase();
    return (...fields) => fields.some((f) => f.toLowerCase().includes(needle));
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    'i',
  );
  return (...fields) => fields.some((f) => regex.test(f));
}
