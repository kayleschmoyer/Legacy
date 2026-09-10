import { minifiedJson } from '@legacy-sports/mcp-format';
import { validateRef } from './validate-ref';

/**
 * Slugify a ref into a filesystem-safe directory name (e.g. "origin/main" ->
 * "origin-main"). Deterministic so repeated `worktree_baseline_setup` calls
 * for the same ref resolve to the same on-disk worktree instead of piling up
 * a new throwaway directory per call — that's the whole point of this tool
 * over `worktree_run_on_ref` (which is intentionally one-shot/self-cleaning).
 */
export function slugifyRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_.-]/g, '-');
}

export interface BaselineSetupArgs {
  ref?: string;
  cleanup?: boolean;
  skipModulesLink?: boolean;
  skipBuild?: boolean;
}

/** Error shape thrown by `execFileSync`-style execs on non-zero exit / timeout / signal. */
export interface ExecError {
  status?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  message?: string;
}

export interface BaselineSetupDeps {
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string;
  /** Runs `file` with `args` in `cwd`, returns stdout, throws an ExecError-shaped object on failure. */
  exec: (
    file: string,
    args: string[],
    opts: { cwd: string; timeout: number },
  ) => string;
  ensureSufficientDepth: (cwd: string) => string[];
  /** Absolute path to `scripts/modules-pool/link.mjs`. */
  linkScriptPath: string;
  /** Path to the Node executable used to run link.mjs. */
  execPath: string;
  /** Shell (and its argv-building) to run the build command with. */
  resolveShell: () => {
    shell: string;
    buildArgs: (command: string) => string[];
  };
  mainRepo: string;
  /** Deterministic path for the persistent baseline worktree for a given ref. */
  baselineWorktreePath: (ref: string) => string;
  existsSync: (path: string) => boolean;
  rmSync: (path: string, opts: { recursive: boolean; force: boolean }) => void;
}

interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

const FETCH_TIMEOUT_MS = 60_000;
const WORKTREE_ADD_TIMEOUT_MS = 60_000;
const LINK_TIMEOUT_MS = 300_000;
const BUILD_TIMEOUT_MS = 600_000; // 10 min — matches worktree_run_long's default ceiling.
const REMOVE_TIMEOUT_MS = 30_000;

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function jsonResult(payload: unknown, isError: boolean): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(payload) }],
    isError,
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Core orchestration for the `worktree_baseline_setup` MCP tool (LS-9744):
 * chain the three manual setup steps an e2e-hold Phase A baseline comparison
 * needs before `nx_run_e2e_specs({ worktreePath })` is usable — `git worktree
 * add`, `scripts/modules-pool/link.mjs`, and `pnpm exec nx build web` — into
 * one call that returns a ready-to-use `worktreePath`.
 *
 * Unlike `worktree_run_on_ref` (LS-9636), the worktree this creates is
 * persistent and keyed by ref, not torn down after a single command: a
 * baseline comparison typically runs several `nx_run_e2e_specs` calls against
 * the same base-branch build, so tearing it down after step one would defeat
 * the purpose. `cleanup: true` removes it explicitly once the comparison is
 * done, and re-running setup for a ref that already has a baseline worktree
 * reuses it (refreshing the checkout) rather than erroring or duplicating it.
 */
export function baselineSetup(
  args: BaselineSetupArgs,
  deps: BaselineSetupDeps,
): ToolResult {
  const { cleanup = false, skipModulesLink = false, skipBuild = false } = args;

  const ref = args.ref && args.ref.trim() ? args.ref.trim() : 'origin/main';
  const refCheck = validateRef(ref);
  if (!refCheck.ok) {
    return errorResult(refCheck.error);
  }

  const { runGit, exec, ensureSufficientDepth, mainRepo } = deps;
  const worktreePath = deps.baselineWorktreePath(ref);
  const log: string[] = [];

  if (cleanup) {
    return cleanupBaseline(ref, worktreePath, deps, log);
  }

  // Best-effort fetch so a remote ref (origin/...), or any ref that only
  // exists on origin, resolves without the caller having to fetch first.
  log.push('$ git fetch origin');
  try {
    runGit(['fetch', 'origin'], mainRepo, { timeout: FETCH_TIMEOUT_MS });
    log.push('Fetch complete.');
  } catch (fetchErr) {
    log.push(`Fetch warning (continuing): ${messageOf(fetchErr)}`);
  }
  log.push(...ensureSufficientDepth(mainRepo));

  const alreadyExists = deps.existsSync(worktreePath);
  if (alreadyExists) {
    log.push(
      `Reusing existing baseline worktree at "${worktreePath}" — refreshing to "${ref}".`,
    );
    try {
      runGit(['checkout', '--detach', ref], worktreePath, {
        timeout: WORKTREE_ADD_TIMEOUT_MS,
      });
      log.push('Baseline worktree refreshed.');
    } catch (err) {
      return jsonResult(
        {
          success: false,
          ref,
          worktreePath,
          message: `Could not refresh the existing baseline worktree to "${ref}".`,
          error: messageOf(err),
          log: log.join('\n'),
        },
        true,
      );
    }
  } else {
    log.push(`$ git worktree add --detach "${worktreePath}" "${ref}"`);
    try {
      runGit(['worktree', 'add', '--detach', worktreePath, ref], mainRepo, {
        timeout: WORKTREE_ADD_TIMEOUT_MS,
      });
      log.push('Worktree created (detached HEAD, no branch).');
    } catch (err) {
      return jsonResult(
        {
          success: false,
          ref,
          worktreePath,
          message: `Could not check out ref "${ref}" into the baseline worktree.`,
          error: messageOf(err),
          log: log.join('\n'),
        },
        true,
      );
    }
  }

  let modulesLinkSucceeded: boolean | null = null;
  let modulesLinkOutput = '';
  if (!skipModulesLink) {
    log.push(
      `$ node scripts/modules-pool/link.mjs --worktree="${worktreePath}" --main-repo="${mainRepo}"`,
    );
    try {
      modulesLinkOutput = exec(
        deps.execPath,
        [
          deps.linkScriptPath,
          `--worktree=${worktreePath}`,
          `--main-repo=${mainRepo}`,
        ],
        { cwd: mainRepo, timeout: LINK_TIMEOUT_MS },
      );
      modulesLinkSucceeded = true;
      log.push('node_modules linked via modules-pool.');
    } catch (linkErr) {
      const e = linkErr as ExecError;
      modulesLinkOutput =
        [e.stdout, e.stderr].filter(Boolean).join('\n') ||
        String(e.message ?? linkErr);
      modulesLinkSucceeded = false;
      log.push(
        'modules-pool link warning (continuing — the build will likely ' +
          `fail without node_modules): ${modulesLinkOutput.slice(0, 800)}`,
      );
    }
  }

  let buildSucceeded: boolean | null = null;
  let buildOutput = '';
  if (!skipBuild) {
    const buildCommand = 'pnpm exec nx build web';
    log.push(`$ ${buildCommand}  (cwd: ${worktreePath})`);
    const { shell, buildArgs } = deps.resolveShell();
    try {
      buildOutput = exec(shell, buildArgs(buildCommand), {
        cwd: worktreePath,
        timeout: BUILD_TIMEOUT_MS,
      });
      buildSucceeded = true;
      log.push('web build complete.');
    } catch (buildErr) {
      const e = buildErr as ExecError;
      buildOutput =
        [e.stdout, e.stderr].filter(Boolean).join('\n') ||
        String(e.message ?? buildErr);
      buildSucceeded = false;
      log.push(`web build failed: ${buildOutput.slice(0, 800)}`);
    }
  }

  const success = modulesLinkSucceeded !== false && buildSucceeded !== false;

  return jsonResult(
    {
      success,
      ref,
      worktreePath,
      reused: alreadyExists,
      modulesLinkSucceeded,
      ...(modulesLinkSucceeded === false
        ? { modulesLinkOutput: modulesLinkOutput.slice(0, 2000) }
        : {}),
      buildSucceeded,
      ...(buildSucceeded === false
        ? { buildOutput: buildOutput.slice(0, 4000) }
        : {}),
      hint: success
        ? `Ready — pass worktreePath to nx_run_e2e_specs, e.g. nx_run_e2e_specs({ specs: [...], worktreePath: "${worktreePath}" }). Call worktree_baseline_setup({ ref: "${ref}", cleanup: true }) when the comparison is done.`
        : undefined,
      log: log.join('\n'),
    },
    !success,
  );
}

function cleanupBaseline(
  ref: string,
  worktreePath: string,
  deps: BaselineSetupDeps,
  log: string[],
): ToolResult {
  const { runGit, mainRepo } = deps;

  if (!deps.existsSync(worktreePath)) {
    return jsonResult(
      {
        success: true,
        ref,
        worktreePath,
        removed: false,
        message:
          'No baseline worktree found for this ref — nothing to clean up.',
        log: log.join('\n'),
      },
      false,
    );
  }

  let removed = false;
  try {
    runGit(['worktree', 'remove', '--force', worktreePath], mainRepo, {
      timeout: REMOVE_TIMEOUT_MS,
    });
    removed = true;
    log.push('git worktree removed.');
  } catch (removeErr) {
    log.push(
      'git worktree remove --force failed (continuing to clean up ' +
        `manually): ${messageOf(removeErr)}`,
    );
    try {
      deps.rmSync(worktreePath, { recursive: true, force: true });
      log.push('Baseline directory removed manually.');
    } catch (rmErr) {
      log.push(
        `Could not remove baseline directory manually: ${messageOf(rmErr)}`,
      );
    }
    try {
      runGit(['worktree', 'prune'], mainRepo, { timeout: REMOVE_TIMEOUT_MS });
      removed = true;
      log.push('git worktree entry pruned.');
    } catch (pruneErr) {
      log.push(`git worktree prune failed: ${messageOf(pruneErr)}`);
    }
  }

  return jsonResult(
    {
      success: removed,
      ref,
      worktreePath,
      removed,
      log: log.join('\n'),
    },
    !removed,
  );
}
