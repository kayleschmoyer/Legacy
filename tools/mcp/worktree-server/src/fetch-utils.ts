// ---------------------------------------------------------------------------
// Pure helpers for the worktree_fetch tool.
//
// Extracted from the request handler in index.ts so the argument assembly and
// result-shaping logic can be unit-tested without spawning git.
// ---------------------------------------------------------------------------

/** Shape returned by worktree_fetch on success. */
export interface FetchResult {
  success: true;
  remote: string;
  branch: string | null;
  upToDate: boolean;
  output: string;
}

/**
 * MCP tool response envelope (subset used by worktree_fetch).
 *
 * The index signature mirrors the MCP SDK's `CallToolResult`, which carries one
 * so additional protocol fields can ride along; without it this sealed type is
 * not assignable to the SDK handler's return union.
 */
export interface ToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/** Arguments accepted by the worktree_fetch tool. */
export interface FetchArgs {
  remote?: string;
  branch?: string;
  worktree?: string;
}

/**
 * Collaborators the fetch handler needs from index.ts. Injected so the handler
 * flow (target resolution, git execution, error shaping) can be unit-tested
 * without spawning git or touching the filesystem.
 */
export interface FetchDeps {
  resolveTargetDir: (
    worktreeKey?: string,
  ) => { path: string } | { error: string };
  runGit: (args: string[], cwd: string) => string;
}

/**
 * Assemble the `git fetch` argument list.
 *
 * Appends the branch only when it is a non-empty (after trimming) string, so
 * `git fetch <remote>` (fetch all) and `git fetch <remote> <branch>` are both
 * expressible. The branch is trimmed to avoid passing stray whitespace to git.
 */
export function buildFetchArgs(remote: string, branch?: string): string[] {
  const args = ['fetch', remote];
  if (branch && branch.trim()) {
    args.push(branch.trim());
  }
  return args;
}

/**
 * Shape the raw `git fetch` stdout/stderr into the tool result.
 *
 * git prints nothing when the remote is already up to date, so empty output is
 * treated as `upToDate: true`. The human-readable `output` field falls back to
 * a fixed string in that case.
 */
export function buildFetchResult(
  remote: string,
  branch: string | undefined,
  rawOutput: string,
): FetchResult {
  const trimmed = rawOutput.trim();
  return {
    success: true,
    remote,
    branch: branch ?? null,
    upToDate: trimmed.length === 0,
    output: trimmed || '(already up to date)',
  };
}

/**
 * Execute the worktree_fetch tool: resolve the target worktree, run `git fetch`,
 * and shape the result (or error) into an MCP tool response.
 *
 * The git executor and worktree resolver are injected via `deps` so this flow —
 * including the target-resolution error branch and the `git fetch` failure
 * branch — is unit-testable without spawning git.
 */
export function executeWorktreeFetch(
  args: FetchArgs,
  deps: FetchDeps,
): ToolResponse {
  const { remote = 'origin', branch, worktree: wtKey } = args;

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return {
      content: [{ type: 'text', text: target.error }],
      isError: true,
    };
  }

  try {
    const output = deps.runGit(buildFetchArgs(remote, branch), target.path);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            buildFetchResult(remote, branch, output),
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    const output =
      [e.stdout, e.stderr].filter(Boolean).join('\n') ||
      e.message ||
      String(err);
    return {
      content: [
        {
          type: 'text',
          text: `git fetch failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
        },
      ],
      isError: true,
    };
  }
}
