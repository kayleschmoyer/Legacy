import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  buildRunOnRefScript,
  RUN_ON_REF_CLEANED_UP_MARKER,
  RUN_ON_REF_CLEANUP_FAILED_MARKER,
} from './run-on-ref-script';
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

/**
 * Minimal subset of `@legacy-sports/mcp-jobs`'s `JobSnapshot` this module
 * needs — kept local (rather than importing the real type) so this file has
 * no dependency on the jobs package beyond the one function it's handed.
 */
export interface RunOnRefJobSnapshot {
  jobId: string;
  status: 'running' | 'done' | 'failed' | 'orphaned';
  exitCode: number | null;
  error: string | null;
  elapsedSec: number;
  log?: string;
  logTail?: string;
  hint?: string;
}

export interface RunOnRefStartJobOptions {
  command: string;
  args: string[];
  cwd: string;
  label: string;
  timeoutMs: number;
  meta?: Record<string, unknown>;
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
  /** Shell (and its argv-building) to run the generated script with — mirrors worktree_run/worktree_run_long. */
  resolveShell: () => {
    shell: string;
    buildArgs: (script: string) => string[];
    isCmdShell?: boolean;
  };
  mainRepo: string;
  tmpWorktreePath: () => string;
  /**
   * Start the command as a background job and wait up to `jobSyncBudgetMs`
   * for it to finish, exactly like `worktree_run`/`worktree_run_long`'s use
   * of `@legacy-sports/mcp-jobs`'s `runJobWithBudget` (LS-10108) — a fast
   * command returns its terminal snapshot inline; a slow one hands back a
   * `{ status: "running", jobId }` snapshot to poll via
   * `worktree_job_wait`/`worktree_job_status` instead of blocking this MCP
   * call past the ~60s cloud transport timeout (LS-8559).
   */
  runJobWithBudget: (
    opts: RunOnRefStartJobOptions,
    syncBudgetMs: number,
  ) => Promise<RunOnRefJobSnapshot>;
  /** Sync budget before handing back a pollable jobId — shared with worktree_run/worktree_run_long. */
  jobSyncBudgetMs: number;
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

/** kind tag stamped into job meta so worktree_job_status/worktree_job_wait can find this formatter. */
export const RUN_ON_REF_JOB_KIND = 'worktree_run_on_ref';

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

function truncateChars(s: string, max = 10_000): string {
  return s.length > max ? `…(truncated)\n${s.slice(-max)}` : s;
}

/** Strip the internal cleanup markers out of output shown back to the caller. */
function stripCleanupMarkers(output: string): string {
  return output
    .split('\n')
    .filter(
      (line) =>
        line !== RUN_ON_REF_CLEANED_UP_MARKER &&
        line !== RUN_ON_REF_CLEANUP_FAILED_MARKER,
    )
    .join('\n');
}

/**
 * Rebuild the worktree_run_on_ref result from a job snapshot — used both
 * inline (within the sync budget) and when completion is observed later via
 * worktree_job_wait / worktree_job_status, so both paths return the same
 * shape. `meta` is the job's persisted metadata (ref, command,
 * modulesLinkSucceeded, and the pre-job setup log), read back by the caller
 * from `JobSnapshot.meta` — passed in already-narrowed since this module has
 * no dependency on the real JobSnapshot type (see RunOnRefJobSnapshot above).
 */
export function formatRunOnRefSnapshot(
  snapshot: RunOnRefJobSnapshot,
  meta: {
    ref: string;
    command: string;
    modulesLinkSucceeded: boolean | null;
    modulesLinkOutput?: string;
    setupLog: string;
  },
): ToolResult {
  if (snapshot.status === 'done' || snapshot.status === 'failed') {
    const rawLog = snapshot.log ?? '';
    const cleanedUp = rawLog.includes(RUN_ON_REF_CLEANED_UP_MARKER);
    const output = stripCleanupMarkers(rawLog);
    const success = snapshot.status === 'done';
    const log = [meta.setupLog, `$ ${meta.command}`, output]
      .filter(Boolean)
      .join('\n');

    return jsonResult(
      {
        success,
        ref: meta.ref,
        command: meta.command,
        exitCode: snapshot.exitCode,
        output,
        modulesLinkSucceeded: meta.modulesLinkSucceeded,
        ...(meta.modulesLinkSucceeded === false
          ? { modulesLinkOutput: (meta.modulesLinkOutput ?? '').slice(0, 2000) }
          : {}),
        cleanedUp,
        log,
        ...(!cleanedUp
          ? {
              cleanupWarning:
                'Every cleanup fallback failed — a stray git worktree may remain ' +
                'at the throwaway checkout path. Run `git worktree prune` manually.',
            }
          : {}),
      },
      !success,
    );
  }

  // running / orphaned — structured snapshot with a re-arm hint.
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            jobId: snapshot.jobId,
            status: snapshot.status,
            ref: meta.ref,
            command: meta.command,
            elapsedSec: snapshot.elapsedSec,
            logTail: truncateChars(stripCleanupMarkers(snapshot.logTail ?? '')),
            ...(snapshot.hint ? { hint: snapshot.hint } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Core orchestration for the `worktree_run_on_ref` MCP tool (LS-9636,
 * job-backed since LS-10108): check out `ref` into a throwaway detached
 * worktree, best-effort link node_modules, then run `command` as a
 * background job that self-cleans the worktree on its own exit — pulled out
 * of index.ts's switch-case (which has no direct test coverage) into an
 * injectable-deps module so the orchestration can be unit tested without
 * shelling out to real git/node processes.
 *
 * The checkout and modules-link steps stay synchronous here (they're fast
 * and were never the reported problem — see LS-10108's ticket body); only
 * the command execution + cleanup moved to a job, since that's the part that
 * legitimately runs past the ~60s cloud MCP transport timeout.
 */
export async function runOnRef(
  args: RunOnRefArgs,
  deps: RunOnRefDeps,
): Promise<ToolResult> {
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

  const { shell, buildArgs, isCmdShell } = deps.resolveShell();
  const script = buildRunOnRefScript({
    tmpWorktreePath,
    mainRepo,
    command,
    isCmdShell,
  });
  const shellArgs = buildArgs(script);

  const meta = {
    ref,
    command,
    modulesLinkSucceeded,
    modulesLinkOutput,
    setupLog: log.join('\n'),
  };

  // Intentional shell execution, not an injection vector — see the
  // RunOnRefArgs doc comment above: `command` is by-design arbitrary,
  // trusted-agent input, identical in contract to worktree_run's own exec.
  // Job-backed (LS-10108): cleanup is embedded in the script itself (see
  // run-on-ref-script.ts) so it still runs even if the job is killed for
  // exceeding timeoutMs.
  const snapshot = await deps.runJobWithBudget(
    {
      command: shell,
      args: shellArgs,
      cwd: mainRepo,
      label: command.length > 80 ? `${command.slice(0, 77)}...` : command,
      timeoutMs,
      meta: { kind: RUN_ON_REF_JOB_KIND, ...meta },
    },
    deps.jobSyncBudgetMs,
  );

  return formatRunOnRefSnapshot(snapshot, meta);
}
