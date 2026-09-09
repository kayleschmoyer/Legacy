/**
 * Detects whether a `twig rebase` failure means the twig binary itself is
 * unavailable (LS-9954) — as opposed to twig running successfully but
 * reporting a real rebase problem (e.g. "no parent registered", a conflict).
 *
 * twig is a local-Windows-only branch-management CLI (AGENTS.md) and is not
 * installed in Claude Code Remote / cloud sessions. There, `execSync('twig
 * rebase', ...)` fails via the shell with exit code 127 and stderr like
 * `/bin/sh: 1: twig: not found`, or — if the shell step is bypassed — Node
 * reports `ENOENT` directly. Both cases should fall back to a plain
 * `git rebase origin/main` instead of surfacing the raw shell error.
 */
export function isTwigNotFoundError(err: {
  message?: string;
  code?: string;
  status?: number;
  stdout?: string;
  stderr?: string;
}): boolean {
  const combined = [err.message, err.stdout, err.stderr]
    .filter(Boolean)
    .join('\n');
  return (
    err.code === 'ENOENT' ||
    err.status === 127 ||
    /command not found|not found|no such file or directory/i.test(combined)
  );
}
