import { matchesLocalPattern } from './matches-local-pattern';

/**
 * Pure filter/cap logic for `worktree_list`'s local-mode listing (LS-9815):
 * `pattern`, `nodeModulesFilter`, and `limit`. Extracted from the handler so
 * this behavior is directly unit-testable without importing `index.ts`
 * (which connects an MCP stdio transport on import).
 */
export interface WorktreeFilterCandidate {
  key: string;
  branch: string;
  path: string;
  isStale: boolean;
}

export interface FilterAndLimitOptions {
  pattern?: string;
  nodeModulesFilter?: 'stale' | 'active';
  limit?: number;
}

export interface FilterAndLimitResult<T extends WorktreeFilterCandidate> {
  /** All candidates matching `pattern` and `nodeModulesFilter`, before capping. */
  filtered: T[];
  /** `filtered`, capped to `limit` (default 20). */
  capped: T[];
  /** True if `filtered` had more entries than `capped`. */
  truncated: boolean;
}

const DEFAULT_LIMIT = 20;

export function filterAndLimitWorktrees<T extends WorktreeFilterCandidate>(
  worktrees: T[],
  { pattern, nodeModulesFilter, limit }: FilterAndLimitOptions,
): FilterAndLimitResult<T> {
  const patternMatches = pattern ? matchesLocalPattern(pattern) : () => true;

  const filtered = worktrees.filter(
    (w) =>
      patternMatches(w.key, w.branch, w.path) &&
      (nodeModulesFilter === undefined ||
        (nodeModulesFilter === 'stale') === w.isStale),
  );

  const maxResults = limit && limit > 0 ? limit : DEFAULT_LIMIT;
  const capped = filtered.slice(0, maxResults);
  const truncated = filtered.length > maxResults;

  return { filtered, capped, truncated };
}
