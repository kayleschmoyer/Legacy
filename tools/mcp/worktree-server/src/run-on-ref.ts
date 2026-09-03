import { minifiedJson } from '@legacy-sports/mcp-format';
import { validateRef } from './validate-ref';

/**
 * `command` is an intentionally arbitrary-shell-command parameter, not
 * sanitized/whitelisted user input — the same trust contract as the
 * pre-existing `worktree_run` / `worktree_run_long` tools on this server
 * (see their "Intentional shell execution, not an injection vector" comments
 * in index.ts) and as the Bash tool itself. The caller is the trusted agent
 * session that owns this MCP server, not an untrusted network client; shell
 * features (pipes, &&, globbing) are the whole point of the parameter, so
 * there is no sanitization step here by design. Only `ref` is validated
 * (`validateRef` below) because that one *is* structured input with a
 * narrow, well-defined grammar — `command` has no such grammar to validate
 * against without breaking the tool's purpose.
 */
export interface RunOnRefArgs {
  command: string;
  ref?: string;
  skipModulesLink?: boolean;
  timeoutSeconds?: number;
}

/** Error shape thrown by `execFileSync`-style execs on non-zero exit / timeout / signal. */
export interface ExecError {
  status?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  message?: string;
}

export interface RunOnRefDeps {
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
  /** Shell (and its argv-building) to run `command` with — mirrors worktree_run/worktree_run_long. */
  resolveShell: () => {
    shell: string;
    buildArgs: (command: string) => string[];
  };
  mainRepo: string;
  tmpWorktreePath: () => string;
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

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TIMEOUT_MS = 300_000;

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
 * Core orchestration for the `worktree_run_on_ref` MCP tool (LS-9636): check
 * out `ref` into a throwaway detached worktree, best-effort link node_modules
 * via the modules-pool, run `command` in it, and always clean up afterward —
 * regardless of whether any step above failed. Pulled out of index.ts's
 * switch-case (which has no direct test coverage) into an injectable-deps
 * module so the orchestration and cleanup-guarantee logic can be unit tested
 * without shelling out to real git/node processes.
 */
export function runOnRef(args: RunOnRefArgs, deps: RunOnRefDeps): ToolResult {
  const { command, skipModulesLink = false, timeoutSeconds } = args;

  if (!command || !command.trim()) {
    return errorResult('command is required and must not be empty.');
  }

  const ref = args.ref && args.ref.trim() ? args.ref.trim() : 'origin/main';
  const refCheck = validateRef(ref);
  if (!refCheck.ok) {
    return errorResult(refCheck.error);
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutSeconds !== undefined) {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      return errorResult('timeoutSeconds must be a positive number');
    }
    if (timeoutSeconds * 1000 > MAX_TIMEOUT_MS) {
      return errorResult(
        `timeoutSeconds must be at most ${MAX_TIMEOUT_MS / 1000} ` +
          `(${MAX_TIMEOUT_MS / 60_000} min).`,
      );
    }
    timeoutMs = timeoutSeconds * 1000;
  }

  const { runGit, exec, ensureSufficientDepth, mainRepo } = deps;
  const log: string[] = [];
  const tmpWorktreePath = deps.tmpWorktreePath();

  // Best-effort fetch so a remote ref (origin/...), or any ref that only
  // exists on origin, resolves without the caller having to fetch first.
  log.push('$ git fetch origin');
  try {
    runGit(['fetch', 'origin'], mainRepo, { timeout: 60_000 });
    log.push('Fetch complete.');
  } catch (fetchErr) {
    log.push(`Fetch warning (continuing): ${messageOf(fetchErr)}`);
  }
  log.push(...ensureSufficientDepth(mainRepo));

  log.push(`$ git worktree add --detach "${tmpWorktreePath}" "${ref}"`);
  try {
    runGit(['worktree', 'add', '--detach', tmpWorktreePath, ref], mainRepo, {
      timeout: 60_000,
    });
  } catch (err) {
    return jsonResult(
      {
        success: false,
        ref,
        message: `Could not check out ref "${ref}" into a throwaway worktree.`,
        error: messageOf(err),
        log: log.join('\n'),
      },
      true,
    );
  }
  log.push('Worktree created (detached HEAD, no branch).');

  let modulesLinkSucceeded: boolean | null = null;
  let modulesLinkOutput = '';
  if (!skipModulesLink) {
    log.push(
      `$ node scripts/modules-pool/link.mjs --worktree="${tmpWorktreePath}" --main-repo="${mainRepo}"`,
    );
    try {
      modulesLinkOutput = exec(
        deps.execPath,
        [
          deps.linkScriptPath,
          `--worktree=${tmpWorktreePath}`,
          `--main-repo=${mainRepo}`,
        ],
        { cwd: mainRepo, timeout: 300_000 },
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
        'modules-pool link warning (continuing — the command may fail ' +
          `if it needs node_modules): ${modulesLinkOutput.slice(0, 800)}`,
      );
    }
  }

  // Intentional shell execution, not an injection vector — see the
  // RunOnRefArgs doc comment above: `command` is by-design arbitrary,
  // trusted-agent input, identical in contract to worktree_run's own exec.
  const { shell, buildArgs } = deps.resolveShell();
  const shellArgs = buildArgs(command);

  let exitCode: number;
  let output: string;
  try {
    output = exec(shell, shellArgs, {
      cwd: tmpWorktreePath,
      timeout: timeoutMs,
    });
    exitCode = 0;
  } catch (cmdErr) {
    const e = cmdErr as ExecError;
    output =
      [e.stdout, e.stderr].filter(Boolean).join('\n') ||
      String(e.message ?? cmdErr);
    if (e.signal) {
      output += `\n(process terminated by signal ${e.signal}${
        e.signal === 'SIGTERM' ? ' — likely the timeout' : ''
      })`;
    }
    exitCode = typeof e.status === 'number' ? e.status : 1;
  }

  // Cleanup — best-effort, always attempted regardless of the command's
  // outcome above, so no run ever leaves a stray `git worktree` entry or
  // temp directory behind (AC2).
  let cleanedUp = false;
  try {
    runGit(['worktree', 'remove', '--force', tmpWorktreePath], mainRepo, {
      timeout: 30_000,
    });
    cleanedUp = true;
    log.push('git worktree removed.');
  } catch (removeErr) {
    log.push(
      'git worktree remove --force failed (continuing to clean up ' +
        `manually): ${messageOf(removeErr)}`,
    );
    try {
      deps.rmSync(tmpWorktreePath, { recursive: true, force: true });
      log.push('Temp directory removed manually.');
    } catch (rmErr) {
      log.push(`Could not remove temp directory manually: ${messageOf(rmErr)}`);
    }
    try {
      runGit(['worktree', 'prune'], mainRepo, { timeout: 30_000 });
      cleanedUp = true;
      log.push('git worktree entry pruned.');
    } catch (pruneErr) {
      log.push(`git worktree prune failed: ${messageOf(pruneErr)}`);
    }
  }

  return jsonResult(
    {
      success: exitCode === 0,
      ref,
      command,
      exitCode,
      output,
      modulesLinkSucceeded,
      ...(modulesLinkSucceeded === false
        ? { modulesLinkOutput: modulesLinkOutput.slice(0, 2000) }
        : {}),
      cleanedUp,
      log: log.join('\n'),
    },
    exitCode !== 0,
  );
}
