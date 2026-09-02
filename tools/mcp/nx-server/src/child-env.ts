/**
 * Env vars injected into this MCP server's own process by `.mcp.json`
 * (`--import tsx` plus a server-specific `TSX_TSCONFIG_PATH` override —
 * see `tools/mcp/nx-server` in `.mcp.json`) that must never reach spawned
 * children. `nx_run_pc_chunk` spawns `make -> nx -> jest` as children, which
 * inherit process env by default; if a jest suite itself shells out to `tsx`
 * (e.g. `lib/db-client/src/scripts/tsx-workspace-resolution.spec.ts`), that
 * grandchild inherits this server's own (relative) `TSX_TSCONFIG_PATH` and
 * resolves it against the wrong cwd, producing a false test failure that has
 * nothing to do with the code under test (LS-9681).
 */
const TSX_ENV_LEAK_KEYS = ['TSX_TSCONFIG_PATH'] as const;

/**
 * Build the env for a spawned child: the host env with this server's own
 * tsx/tsconfig env stripped, then the caller-supplied overrides layered on
 * top. Always returns an explicit env object (never `undefined`) so callers
 * can't accidentally fall back to Node's raw `process.env` inheritance,
 * which would re-leak the stripped keys.
 */
export function buildChildEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = { ...process.env };
  for (const key of TSX_ENV_LEAK_KEYS) {
    delete sanitized[key];
  }
  return {
    ...sanitized,
    ...env,
    // Preserve the host PATH so spawned processes can find binaries
    // even if the caller-supplied env includes a PATH/Path key.
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.Path ? { Path: process.env.Path } : {}),
  };
}
