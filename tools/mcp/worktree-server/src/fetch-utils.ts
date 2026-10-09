// ---------------------------------------------------------------------------
// Pure helpers for the worktree_fetch tool.
//
// Extracted from the request handler in index.ts so the argument assembly and
// result-shaping logic can be unit-tested without spawning git.
// ---------------------------------------------------------------------------

import { isShallowRepository } from './shallow-utils';

/** Shape returned by worktree_fetch on success. */
export interface FetchResult {
  success: true;
  remote: string;
  branch: string | null;
  upToDate: boolean;
  /** Commits on the local branch not yet on the remote-tracking ref, or `null` if it couldn't be determined (e.g. detached HEAD, branch not yet tracked). */
  ahead: number | null;
  /** Commits on the remote-tracking ref not yet on the local branch, or `null` if it couldn't be determined. */
  behind: number | null;
  output: string;
  /** `git rev-parse --is-shallow-repository` after the fetch (LS-10112). */
  isShallow: boolean;
  /** `git rev-list --count HEAD` after the fetch, or null if it couldn't be read. */
  commitCount: number | null;
}

/** Real ahead/behind divergence between a local branch and its remote-tracking ref. */
export interface RemoteDivergence {
  ahead: number;
  behind: number;
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
  /**
   * Fully unshallow the clone (`git fetch --unshallow`). Mutually exclusive
   * with `deepen` — use this instead of guessing a `deepen` count when the
   * commit you need is an unknown distance back (LS-10112).
   */
  unshallow?: boolean;
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
  /**
   * Runs `git fetch` and reports the real exit status plus both streams
   * (LS-10279). git writes ref-update lines and `gc --auto` housekeeping
   * notices to stderr even on success, so success must be judged by `status`
   * alone. When omitted, the fetch falls back to `runGit` (throws on failure).
   */
  runFetch?: (args: string[], cwd: string) => FetchProcessResult;
}

/** Outcome of a `git fetch` process: exit status plus both captured streams. */
export interface FetchProcessResult {
  /** Exit code, or `null` when the process was killed / failed to spawn. */
  status: number | null;
  stdout: string;
  stderr: string;
  /** Spawn/timeout error message when `status` is `null`. */
  error?: string;
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
 *
 * `unshallow` takes precedence over `deepen` (callers should reject passing
 * both before reaching here — see `executeWorktreeFetch`) and inserts
 * `--unshallow` instead, for the case where the needed commit is an unknown
 * distance back and a guessed `deepen` count won't reach it (LS-10112).
 */
export function buildFetchArgs(
  remote: string,
  branch?: string,
  deepen?: number,
  unshallow?: boolean,
): string[] {
  const args = ['fetch'];
  if (unshallow) {
    args.push('--unshallow');
  } else if (Number.isInteger(deepen) && (deepen as number) > 0) {
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
 * `upToDate`/`ahead`/`behind` come from an actual comparison of the local
 * branch against its remote-tracking ref (`divergence`) whenever one could be
 * computed. git's own fetch-summary lines ("abc123..def456  branch ->
 * origin/branch") are written to stderr, which `execFileSync` does not
 * surface to callers that only capture stdout (LS-10084) — so `rawOutput`
 * being empty is *not* reliable evidence that nothing changed. It is kept
 * only as a last-resort fallback for the rare case a real divergence check
 * isn't possible (detached HEAD with no `branch` argument, a branch with no
 * remote-tracking ref yet, etc).
 *
 * `isShallow`/`commitCount` are passed in already-computed (post-fetch) so an
 * agent reading a `worktree_fetch` result can see the clone's shallow state
 * directly, instead of reaching for the banned `git rev-parse
 * --is-shallow-repository` via Bash — an empty history-archaeology result on
 * a shallow clone otherwise reads as "never existed" (LS-10112).
 */
export function buildFetchResult(
  remote: string,
  branch: string | undefined,
  rawOutput: string,
  divergence: RemoteDivergence | null,
  isShallow: boolean,
  commitCount: number | null,
): FetchResult {
  const trimmed = rawOutput.trim();
  const upToDate = divergence
    ? divergence.ahead === 0 && divergence.behind === 0
    : trimmed.length === 0;
  return {
    success: true,
    remote,
    branch: branch ?? null,
    upToDate,
    ahead: divergence?.ahead ?? null,
    behind: divergence?.behind ?? null,
    output: trimmed || '(already up to date)',
    isShallow,
    commitCount,
  };
}

/**
 * Run a git command and return its trimmed stdout, or `null` on any failure.
 * Used for the best-effort divergence probes below, where a resolution
 * failure (no such ref, detached HEAD, etc.) should fall back gracefully
 * rather than blow up the whole `worktree_fetch` call.
 */
function safeGit(
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string,
  args: string[],
  cwd: string,
): string | null {
  try {
    return runGit(args, cwd, { timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

/**
 * Compute real ahead/behind divergence between a local branch and its
 * remote-tracking ref (`<remote>/<branch>`) via `git rev-list --count`,
 * instead of guessing from `git fetch`'s captured output text (LS-10084 —
 * see {@link buildFetchResult}). Returns `null` when the branch or its
 * remote-tracking ref can't be resolved, so the caller can fall back.
 *
 * Call this *after* `git fetch` has run so the remote-tracking ref reflects
 * whatever the remote holds now — including commits pushed directly to the
 * branch (e.g. by a merge-queue bot) rather than merged locally.
 */
export function computeRemoteDivergence(
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string,
  cwd: string,
  remote: string,
  branch: string | undefined,
): RemoteDivergence | null {
  const branchName =
    branch && branch.trim()
      ? branch.trim()
      : safeGit(runGit, ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!branchName || branchName === 'HEAD') {
    return null;
  }

  const remoteRef = `${remote}/${branchName}`;
  const localSha = safeGit(runGit, ['rev-parse', '--verify', branchName], cwd);
  const remoteSha = safeGit(runGit, ['rev-parse', '--verify', remoteRef], cwd);
  if (!localSha || !remoteSha) {
    return null;
  }
  if (localSha === remoteSha) {
    return { ahead: 0, behind: 0 };
  }

  const aheadRaw = safeGit(
    runGit,
    ['rev-list', '--count', `${remoteRef}..${branchName}`],
    cwd,
  );
  const behindRaw = safeGit(
    runGit,
    ['rev-list', '--count', `${branchName}..${remoteRef}`],
    cwd,
  );
  return {
    ahead: aheadRaw ? parseInt(aheadRaw, 10) : 0,
    behind: behindRaw ? parseInt(behindRaw, 10) : 0,
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
  const {
    remote = 'origin',
    branch,
    worktree: wtKey,
    deepen,
    unshallow,
  } = args;

  if (unshallow && Number.isInteger(deepen) && (deepen as number) > 0) {
    return {
      content: [
        {
          type: 'text',
          text: '`unshallow` and `deepen` are mutually exclusive — pass one or the other, not both.',
        },
      ],
      isError: true,
    };
  }

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return {
      content: [{ type: 'text', text: target.error }],
      isError: true,
    };
  }

  try {
    const fetchArgs = buildFetchArgs(remote, branch, deepen, unshallow);
    let output: string;
    if (deps.runFetch) {
      const proc = deps.runFetch(fetchArgs, target.path);
      if (proc.status !== 0) {
        return fetchFailure(proc.status, proc);
      }
      // Exit 0 is success regardless of stderr; surface git's ref-update and
      // housekeeping lines as output (LS-10279).
      output = [proc.stdout, proc.stderr].filter(Boolean).join('\n');
    } else {
      output = deps.runGit(fetchArgs, target.path);
    }
    const divergence = computeRemoteDivergence(
      deps.runGit,
      target.path,
      remote,
      branch,
    );
    const isShallow = isShallowRepository({ runGit: deps.runGit }, target.path);
    let commitCount: number | null = null;
    try {
      const parsed = parseInt(
        deps.runGit(['rev-list', '--count', 'HEAD'], target.path).trim(),
        10,
      );
      commitCount = Number.isNaN(parsed) ? null : parsed;
    } catch {
      commitCount = null;
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            buildFetchResult(
              remote,
              branch,
              output,
              divergence,
              isShallow,
              commitCount,
            ),
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
    return fetchFailure(e.status ?? null, e, e.message ?? String(err));
  }
}

function fetchFailure(
  status: number | null,
  streams: { stdout?: string; stderr?: string; error?: string },
  fallback?: string,
): ToolResponse {
  const output =
    [streams.stdout, streams.stderr].filter(Boolean).join('\n') ||
    streams.error ||
    fallback ||
    '';
  return {
    content: [
      {
        type: 'text',
        text: `git fetch failed (exit code ${status ?? 'unknown'}):\n${output}`,
      },
    ],
    isError: true,
  };
}
