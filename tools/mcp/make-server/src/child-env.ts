/**
 * Env vars injected into this MCP server's own process by `mcp-bootstrap.mjs`
 * (`--import tsx` plus an auto-computed `TSX_TSCONFIG_PATH` pointing at
 * `tools/mcp/make-server/tsconfig.json`, since `.mcp.json` doesn't set one
 * explicitly for `legacy-sports-make`) that must never reach spawned
 * children. `runCommand`/`runMake` spawn `make -> nx -> jest` (and other)
 * children, which inherit process env by default; if a raw-tsx child is
 * shelled out to transitively, it would inherit this server's own
 * `TSX_TSCONFIG_PATH` and resolve it against the wrong tsconfig instead of
 * its own (LS-9806, same root cause as LS-9681's nx-server leak).
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
