import { minifiedJson } from '@legacy-sports/mcp-format';
import type { JobSnapshot } from '@legacy-sports/mcp-jobs';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  startCommandInBackground,
  SYNC_BUDGET_MS,
  waitForJobDone,
} from './make-run-bg.js';
import { getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Default process-level budget for a wt-setup phase. A worktree created
 * against a lockfile state with no existing pool slot makes `link.mjs`
 * materialize a fresh slot — a full pnpm install against a possibly cold
 * store, which routinely exceeds the old hard-coded 300s and is why this tool
 * used to report a timeout while the install kept running (LS-10087). Matches
 * the `install`/`install-force` budget in run-target.ts and CI's own 30-minute
 * job budget.
 */
export const WT_SETUP_DEFAULT_TIMEOUT_MS = 1_800_000;

/**
 * How to tell a genuinely broken toolchain from an install that simply has
 * not finished. Named in every non-success result: the failure mode this tool
 * produced before job semantics existed was a half-materialized
 * `node_modules/` (present, but no `.bin/`), which made the *next* tool call
 * fail with `'nx' is not recognized` and read as repo corruption (LS-10087).
 */
export const SLOT_HEALTH_HINT =
  'node_modules may be half-materialized (directory present, .bin/ missing) — that is not toolchain corruption. ' +
  'Confirm slot health with `node scripts/modules-pool/link.mjs --check` (add --rebuild if it still reports unhealthy) ' +
  'before concluding the repo is broken, and do not re-run a heavy install on top of one already in flight.';

/** Message for the sync-budget hand-off: the work is still running server-side. */
export function buildRunningHint(jobId: string, phase: string): string {
  return (
    `"${phase}" is still in flight — the install has NOT been abandoned. ` +
    `Poll it with make_run_wait({ jobId: "${jobId}" }) (re-call while it returns status:"running") ` +
    `or make_run_status({ jobId: "${jobId}" }) for a non-blocking snapshot. Do NOT re-run make_wt_setup ` +
    `while the job is in progress. ${SLOT_HEALTH_HINT}`
  );
}

/** Message for a phase killed by its own process-level timeout. */
export function buildTimeoutHint(phase: string, timeoutMs: number): string {
  return (
    `"${phase}" hit its ${timeoutMs}ms process timeout and its process tree was killed. ` +
    `Re-invoke make_wt_setup with a larger timeoutMs (a cold modules pool slot can need 20+ minutes). ` +
    SLOT_HEALTH_HINT
  );
}

/**
 * Message for the partial-completion hand-off: an earlier phase outran the
 * sync budget while later phases were still pending. Re-invoking the tool once
 * the job finishes is safe — every phase is idempotent, and a re-invocation
 * resumes at whichever phase is still outstanding.
 */
export function buildRemainingPhasesHint(remainingPhases: string[]): string {
  return (
    `${remainingPhases.length} later phase(s) have not started yet: ${remainingPhases.join(', ')}. ` +
    'Once the job above reaches status:"done", re-invoke make_wt_setup with the same arguments — ' +
    'each phase is idempotent and the re-invocation picks up from whatever is still outstanding.'
  );
}

interface WtSetupParams {
  worktreePath: string;
  removeSymlink?: boolean;
  noFrozenLockfile?: boolean;
  timeoutMs?: number;
}

/** One long-running step of the setup sequence, run as a background job. */
interface Phase {
  /** Human-readable name, also the `target` surfaced by make_run_status. */
  name: string;
  command: string;
  args: string[];
  cwd: string;
}

function errorResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(payload) }],
    isError: true,
  };
}

function okResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(payload) }],
  };
}

/**
 * Set up a worktree for development. This runs `make wt-setup WT=<path>` which:
 *   1. Creates a node_modules symlink to the main repo (if not already present)
 *   2. Copies .env from the main repo
 *   3. Creates .twig config
 *   4. Installs git hooks
 *
 * If removeSymlink is true, it will:
 *   1. Remove the node_modules symlink
 *   2. Run `make install` to create independent node_modules
 *
 * This is needed when the worktree requires different dependencies (e.g.,
 * after adding/removing packages on the branch).
 *
 * Every long-running step runs as a background job on make-server's shared
 * runner, so a step that outruns the synchronous budget hands back
 * `{ status: "running", jobId }` — pollable with the existing make_run_status
 * / make_run_wait — instead of reporting a bare timeout while the install
 * keeps running server-side (LS-10087).
 *
 * NOTE: `make wt-setup` is Windows-only. On other platforms this tool returns an error.
 */
export async function wtSetup(params: WtSetupParams): Promise<ToolResult> {
  const {
    worktreePath,
    removeSymlink = false,
    noFrozenLockfile = false,
    timeoutMs = WT_SETUP_DEFAULT_TIMEOUT_MS,
  } = params;

  if (process.platform !== 'win32') {
    return {
      content: [
        {
          type: 'text',
          text: 'make_wt_setup is Windows-only. On Linux/macOS, run: make install && cp .env from main repo.',
        },
      ],
      isError: true,
    };
  }

  if (!existsSync(worktreePath)) {
    return errorResult({
      success: false,
      worktreePath,
      error: `Worktree path does not exist: ${worktreePath}`,
    });
  }

  const repoRoot = getRepoRoot();
  const log: string[] = [`[worktree: ${worktreePath}]`];
  let symlinkActuallyRemoved = false;

  // One budget for the whole call, not per phase: the sync window exists to
  // stay under the ~60s MCP transport timeout, and that ceiling applies to the
  // tool call as a whole however many phases it runs.
  const deadline = Date.now() + SYNC_BUDGET_MS;

  /**
   * Run one phase as a background job, waiting only for what is left of the
   * shared sync budget. Returns the job snapshot plus its id — the snapshot is
   * still `status: "running"` when the budget expires, which is a hand-off,
   * not a failure.
   */
  async function runPhase(
    phase: Phase,
  ): Promise<{ jobId: string; snapshot: JobSnapshot } | ToolResult> {
    log.push('', `$ ${phase.command} ${phase.args.join(' ')}`);
    const { jobId } = startCommandInBackground({
      command: phase.command,
      args: phase.args,
      label: phase.name,
      target: phase.name,
      workDir: phase.cwd,
      timeoutMs,
      // Windows resolves `make` and `pnpm` through .cmd/.bat shims that
      // execFile cannot launch without a shell (LS-9153). This tool is
      // Windows-only (guarded above), but key off the platform explicitly
      // rather than relying on that guard from a distance.
      shell: process.platform === 'win32',
    });
    const remaining = Math.max(deadline - Date.now(), 1_000);
    const snapshot = await waitForJobDone(jobId, remaining);
    if (!snapshot) {
      return errorResult({
        success: false,
        worktreePath,
        symlinkRemoved: symlinkActuallyRemoved,
        error: `Job "${jobId}" vanished from the registry — re-run make_wt_setup.`,
        log: log.join('\n'),
      });
    }
    return { jobId, snapshot };
  }

  function isToolResult(
    value: { jobId: string; snapshot: JobSnapshot } | ToolResult,
  ): value is ToolResult {
    return 'content' in value;
  }

  /**
   * Turn a non-terminal or failed phase snapshot into the tool's result.
   * Returns null when the phase succeeded and the sequence should continue.
   */
  function resultForPhase(
    phase: Phase,
    jobId: string,
    snapshot: JobSnapshot,
    remainingPhases: string[],
  ): ToolResult | null {
    if (snapshot.status === 'running') {
      return okResult({
        status: 'running',
        success: false,
        jobId,
        phase: phase.name,
        worktreePath,
        symlinkRemoved: symlinkActuallyRemoved,
        elapsedSec: snapshot.elapsedSec,
        timeoutMs,
        ...(remainingPhases.length > 0
          ? {
              remainingPhases,
              remainingPhasesHint: buildRemainingPhasesHint(remainingPhases),
            }
          : {}),
        logTail: snapshot.logTail ?? '',
        hint: buildRunningHint(jobId, phase.name),
        log: log.join('\n'),
      });
    }

    const timedOut =
      snapshot.error != null && /internal timeout/i.test(snapshot.error);
    const failed = snapshot.exitCode !== 0 || snapshot.error !== null;
    log.push(snapshot.log ?? snapshot.logTail ?? '');

    if (timedOut) {
      return errorResult({
        status: 'failed',
        success: false,
        timedOut: true,
        jobId,
        phase: phase.name,
        worktreePath,
        symlinkRemoved: symlinkActuallyRemoved,
        elapsedSec: snapshot.elapsedSec,
        timeoutMs,
        error: `"${phase.name}" timed out after ${timeoutMs}ms.`,
        hint: buildTimeoutHint(phase.name, timeoutMs),
        log: log.join('\n'),
      });
    }

    if (failed) {
      return errorResult({
        status: 'failed',
        success: false,
        jobId,
        phase: phase.name,
        worktreePath,
        symlinkRemoved: symlinkActuallyRemoved,
        elapsedSec: snapshot.elapsedSec,
        exitCode: snapshot.exitCode,
        ...(snapshot.error ? { error: snapshot.error } : {}),
        hint: SLOT_HEALTH_HINT,
        log: log.join('\n'),
      });
    }

    return null;
  }

  /** Phases that follow the symlink removal, when removeSymlink is set. */
  function installPhases(): Phase[] {
    if (!noFrozenLockfile) {
      return [
        {
          name: 'make install',
          command: 'make',
          args: ['install'],
          cwd: worktreePath,
        },
      ];
    }
    return [
      {
        name: 'pnpm install --no-frozen-lockfile',
        command: 'pnpm',
        args: ['install', '--no-frozen-lockfile'],
        cwd: worktreePath,
      },
      {
        name: 'make install',
        command: 'make',
        args: ['install'],
        cwd: worktreePath,
      },
    ];
  }

  // Step 1: `make wt-setup` from the main repo. This is the phase that
  // materializes a modules-pool slot, so it is the one that outran the old cap.
  const wtSetupArgs = ['wt-setup', `WT=${worktreePath}`];
  if (noFrozenLockfile) wtSetupArgs.push('NOFROZEN=1');
  const setupPhase: Phase = {
    name: 'make wt-setup',
    command: 'make',
    args: wtSetupArgs,
    cwd: repoRoot,
  };

  const setupRun = await runPhase(setupPhase);
  if (isToolResult(setupRun)) return setupRun;
  const setupResult = resultForPhase(
    setupPhase,
    setupRun.jobId,
    setupRun.snapshot,
    // The symlink removal is instant; only the installs are worth naming.
    removeSymlink ? installPhases().map((p) => p.name) : [],
  );
  if (setupResult) return setupResult;
  log.push('Worktree setup complete.');

  // Step 2: optionally remove the symlink and install independent deps.
  if (removeSymlink) {
    const nmPath = join(worktreePath, 'node_modules');

    if (isSymlink(nmPath)) {
      log.push('', 'Removing node_modules symlink...');
      // rmSync with recursive: false removes the symlink itself
      // without following it or deleting the target directory contents.
      rmSync(nmPath, { recursive: false });
      symlinkActuallyRemoved = true;
      log.push('Symlink removed.');
    } else if (existsSync(nmPath)) {
      log.push(
        '',
        'node_modules exists but is not a symlink — skipping symlink removal.',
      );
    } else {
      log.push('', 'No node_modules found — running install...');
    }

    const phases = installPhases();
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const run = await runPhase(phase);
      if (isToolResult(run)) return run;
      const result = resultForPhase(
        phase,
        run.jobId,
        run.snapshot,
        phases.slice(i + 1).map((p) => p.name),
      );
      if (result) return result;
    }
    log.push('Independent node_modules installed.');
  }

  return okResult({
    status: 'done',
    success: true,
    worktreePath,
    symlinkRemoved: symlinkActuallyRemoved,
    log: log.join('\n'),
  });
}
