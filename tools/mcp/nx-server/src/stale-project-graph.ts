// Kept dependency-free (no run-command / import.meta) so it can be
// unit-tested directly under the commonjs jest config, the same reason
// tools/mcp/make-server/src/path-safety.ts is a separate module.

/**
 * Matches Nx's project-graph-construction failure. The `@nx/jest`,
 * `@nx/eslint`, and `nx/js/dependencies-and-lockfile` plugins each eagerly
 * resolve config/module state for *every* project while building the graph,
 * so a single stale entry breaks `nx run <any-project>:<target>` repo-wide —
 * not just the affected project. In CCR sessions this happens when
 * `.nx/workspace-data` was cached against a node_modules snapshot that
 * doesn't match what's actually on disk once the container finishes
 * provisioning (e.g. after a later `pnpm install`); the specific missing
 * module varies (`react-native/jest-preset`, `.modules.yaml`,
 * `@typescript-eslint/type-utils`) but the fix is the same in every case:
 * drop the stale graph cache and rebuild it. See LS-8936.
 */
const STALE_PROJECT_GRAPH_PATTERN = /Failed to process project graph/i;

export function isStaleProjectGraphError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return STALE_PROJECT_GRAPH_PATTERN.test(msg);
}

/** Paths (relative to the Nx workspace root) that make up the project graph cache. */
export const PROJECT_GRAPH_CACHE_DIRS = ['.nx/cache', '.nx/workspace-data'];
