// Path-parameter safety helpers for make-server tools. Kept dependency-free (no
// run-command / import.meta) so they can be unit-tested directly under the
// commonjs jest config, the same reason format.ts is a separate module.

/**
 * Return true if `value` contains characters that must never appear in a
 * path-like tool parameter (a terraform `dir`, a worktree path, etc.):
 * control characters or shell metacharacters such as `;`, `&`, `|`, backtick,
 * `$`, `<`, `>`, and newlines. This is defense-in-depth — make-server runs child
 * processes via array args (no shell), so these are not interpreted today, but
 * rejecting them closes the gap if a shell is ever introduced and rejects
 * obviously-malformed input early (e.g. `"; rm -rf /"`).
 *
 * Ordinary path characters — alphanumerics, `/`, `\`, `.`, `-`, `_`, `:`, and
 * spaces — are all allowed so legitimate absolute/relative paths pass.
 */
export function containsUnsafePathChars(value: string): boolean {
  const hasControlChar = [...value].some((c) => {
    const code = c.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  return hasControlChar || /[;&|`$<>\n\r]/.test(value);
}
