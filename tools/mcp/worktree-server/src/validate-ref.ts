/**
 * Validates a git ref argument for worktree_run_on_ref. `execFileSync` passes
 * the ref as a single argv element (no shell interpolation), but git itself
 * can still misparse a value starting with `-` as a flag, and whitespace or
 * exotic characters are never valid in a single ref — so this is defence in
 * depth, not an injection boundary.
 */
export function validateRef(
  ref: string,
): { ok: true } | { ok: false; error: string } {
  if (
    ref.startsWith('-') ||
    /\s/.test(ref) ||
    !/^[a-zA-Z0-9_./@~^{}:-]+$/.test(ref)
  ) {
    return {
      ok: false,
      error:
        `Invalid ref: "${ref}". Only alphanumeric, '_', '.', '/', '@', '~', '^', ` +
        "'{', '}', ':', '-' allowed, no whitespace, and it must not start with '-'.",
    };
  }
  return { ok: true };
}
