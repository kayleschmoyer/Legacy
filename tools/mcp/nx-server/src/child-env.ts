import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

const join = (...parts: string[]): string => win32.join(...parts);

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
 * Git for Windows install roots searched for `bash.exe` and the msys coreutils the repo's
 * script tests shell out to.
 * An MCP server launched from the desktop app often has only `Git\cmd` on
 * PATH, so `spawnSync('bash')` fails with ENOENT inside `pc-workflows`
 * (LS-10370). Interactive Git Bash shells do not have this problem.
 */
function gitRootCandidates(env: NodeJS.ProcessEnv): string[] {
  const roots = [
    env['ProgramFiles'],
    env['ProgramFiles(x86)'],
    env['LOCALAPPDATA'] ? join(env['LOCALAPPDATA'], 'Programs') : undefined,
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].filter((root): root is string => Boolean(root));
  return roots.map((root) => join(root, 'Git'));
}

/**
 * On Windows, return `pathValue` with the first Git for Windows install's
 * `usr\\bin` and `bin` appended when `bash.exe` is not already reachable.
 * Appended (not prepended) so it never shadows tools the host PATH already
 * resolves. No-op on other platforms, so Linux behaviour is unchanged.
 */
export function ensureGitBashOnPath(
  pathValue: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (platform !== 'win32') return pathValue;
  const entries = (pathValue ?? '').split(';').filter(Boolean);
  if (entries.some((dir) => exists(join(dir, 'bash.exe')))) return pathValue;
  for (const gitRoot of gitRootCandidates(env)) {
    const dirs = [join(gitRoot, 'usr', 'bin'), join(gitRoot, 'bin')].filter(
      (dir) => exists(join(dir, 'bash.exe')) || exists(dir),
    );
    if (dirs.some((dir) => exists(join(dir, 'bash.exe')))) {
      return [...entries, ...dirs].join(';');
    }
  }
  return pathValue;
}

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
    ...(process.env.PATH
      ? { PATH: ensureGitBashOnPath(process.env.PATH) }
      : {}),
    ...(process.env.Path
      ? { Path: ensureGitBashOnPath(process.env.Path) }
      : {}),
  };
}
