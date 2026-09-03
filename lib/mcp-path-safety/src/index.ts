import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Result of validating an `outputPath`-style parameter: either the resolved,
 * write-safe absolute path, or a human-readable error to return from the
 * calling tool.
 */
export type OutputPathResult =
  | { ok: true; resolved: string }
  | { ok: false; error: string };

/**
 * Validate an `outputPath` parameter shared by any MCP tool that writes a
 * fetched blob to disk instead of returning it in the tool result (LS-9429:
 * `worktree_show_file`, `github_get_file_content`). Refuses anything that
 * isn't an absolute path contained within one of `allowedRoots` — the only
 * defense between an agent-supplied path and an arbitrary filesystem write.
 *
 * A root matches when the resolved path equals it or sits underneath it
 * (via `path.relative`, so trailing-separator and Windows-drive differences
 * are handled the same way `path` handles them elsewhere in this repo).
 */
export function validateOutputPath(
  outputPath: string,
  allowedRoots: readonly string[],
): OutputPathResult {
  if (!isAbsolute(outputPath)) {
    return {
      ok: false,
      error: `outputPath must be an absolute path, got: "${outputPath}"`,
    };
  }

  const resolved = resolve(outputPath);
  const resolvedRoots = allowedRoots.map((root) => resolve(root));
  const contained = resolvedRoots.some((root) => {
    const rel = relative(root, resolved);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });

  if (!contained) {
    return {
      ok: false,
      error:
        `outputPath "${resolved}" is outside the allowed write targets ` +
        `(${resolvedRoots.join(', ')}). Refusing to write outside the repo/worktree/scratch dir.`,
    };
  }

  return { ok: true, resolved };
}
