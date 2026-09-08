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
  /** Deepen a shallow clone by this many commits (`git fetch --deepen=<n>`). */
  deepen?: number;
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
 * `--deepen=<n>` is inserted before the remote (matching `git fetch --deepen=N
 * <remote> <branch>`) when `deepen` is a positive integer, so callers can
 * recover a shallow clone (e.g. after a stale merge-base) without a raw
 * `git fetch --deepen` via Bash (LS-9232).
 */
export function buildFetchArgs(
  remote: string,
  branch?: string,
  deepen?: number,
): string[] {
  const args = ['fetch'];
  if (Number.isInteger(deepen) && (deepen as number) > 0) {
    args.push(`--deepen=${deepen}`);
  }
  args.push(remote);
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
/**
 * Best-effort refresh of the local remote-tracking ref before a
 * `--force-with-lease` push (LS-4898). Swallows any `git fetch` failure —
 * an offline caller, a branch not yet on the remote (first push), or a
 * transient network error should all fall through to the caller's existing
 * stale-info handling rather than blocking the push. Returns whether the
 * fetch itself succeeded, purely for logging/testing; callers should not
 * branch on it.
 */
export function tryRefreshRemoteTrackingRef(
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string,
  branch: string,
  cwd: string,
  timeoutMs: number,
): boolean {
  try {
    runGit(['fetch', 'origin', branch], cwd, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export function executeWorktreeFetch(
  args: FetchArgs,
  deps: FetchDeps,
): ToolResponse {
  const { remote = 'origin', branch, worktree: wtKey, deepen } = args;

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return {
      content: [{ type: 'text', text: target.error }],
      isError: true,
    };
  }

  try {
    const output = deps.runGit(
      buildFetchArgs(remote, branch, deepen),
      target.path,
    );
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
