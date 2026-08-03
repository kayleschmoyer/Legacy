import { type ChildProcess, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Materialized into each server's jobsDir() on first use (see
// `ensureWrapperScript`) rather than shipped as sibling files resolved via
// `import.meta.url` — this package's test config (@swc/jest, CommonJS output)
// cannot parse `import.meta` regardless of tsconfig module target, and a
// source-relative path would differ between running from `src` (tsx) and any
// future compiled output anyway. Writing a small script string to a tmpdir
// path is the same pattern this file already uses for job logs/metadata.

/**
 * POSIX wrapper (see `lib/mcp-jobs/README.md`): runs a command and records its
 * exit code to a sidecar file, independent of whether the spawning MCP server
 * process is still alive when the command finishes (LS-8358). Invoked as
 * `sh run-with-exit-sidecar.sh <exitCodePath> <command> [args...]`. Args are
 * forwarded via `"$@"` (not text-interpolated), so no escaping is needed
 * regardless of their content.
 */
const SH_WRAPPER_SCRIPT = `#!/bin/sh
exit_path="$1"
shift
"$@"
code=$?
printf '%s' "$code" > "$exit_path"
exit "$code"
`;

/**
 * Windows wrapper: same contract as the sh wrapper above, invoked as
 * `powershell -File run-with-exit-sidecar.ps1 <exitCodePath> <command> [args...]`.
 * Args after `-File` arrive as a true array (`ValueFromRemainingArguments`),
 * not text-interpolated, so no escaping is needed regardless of their content.
 */
const PS_WRAPPER_SCRIPT = `param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$ExitCodePath,

  [Parameter(Mandatory = $true, Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$CommandAndArgs
)

$command = $CommandAndArgs[0]
$commandArgs = @()
if ($CommandAndArgs.Count -gt 1) {
  $commandArgs = $CommandAndArgs[1..($CommandAndArgs.Count - 1)]
}

& $command @commandArgs
$code = $LASTEXITCODE
if ($null -eq $code) {
  $code = 0
}
Set-Content -LiteralPath $ExitCodePath -Value $code -NoNewline
exit $code
`;

// Shared background-job runner for our in-repo MCP servers (`tools/mcp/*`).
//
// Cloud Claude Code sessions enforce a ~60s MCP transport timeout on every
// tool call, so no tool may block longer than MAX_WAIT_MS in a single call.
// Long-running work is spawned as a background job; callers get a jobId
// immediately (or after a bounded sync budget) and poll with the server's
// wait/status tool. Job metadata is persisted to disk next to the log file so
// a restarted MCP server can still report on jobs it did not spawn.
//
// Each server creates its own runner via `createJobRunner` — the config
// namespaces jobIds and the on-disk metadata directory per server and lets the
// "still running" hint name that server's poll tool.

/** Hard cap for any single blocking wait — stays under the ~60s MCP transport timeout. */
export const MAX_WAIT_MS = 55_000;
const POLL_INTERVAL_MS = 1_000;
const LOG_TAIL_CHARS = 5_000;
const JOB_LIST_LIMIT = 20;

export type JobStatus = 'running' | 'done' | 'failed' | 'orphaned';

export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  label: string;
  cwd: string;
  elapsedSec: number;
  exitCode: number | null;
  error: string | null;
  /** Caller-supplied metadata (e.g. result-formatter kind and its inputs). */
  meta?: Record<string, unknown>;
  /**
   * True when the job hit its process-level timeout but was finalized as
   * passed because its log already matched the caller's successMarker.
   */
  recoveredFromTimeout?: boolean;
  /** Last LOG_TAIL_CHARS of output — present on running/orphaned snapshots. */
  logTail?: string;
  /** Full output — present on terminal (done/failed) snapshots. */
  log?: string;
  hint?: string;
}

interface JobMeta {
  jobId: string;
  pid: number;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  startTime: number;
  /** Process-level timeout; lets a later server process detect an expired job. */
  timeoutMs?: number;
  done: boolean;
  exitCode: number | null;
  error: string | null;
  /** True when the timeout fired but the log already matched successMarker. */
  recoveredFromTimeout?: boolean;
  /** Caller-supplied metadata — persisted so a restarted server can still format results. */
  meta?: Record<string, unknown>;
}

interface JobRecord extends JobMeta {
  logPath: string;
  metaPath: string;
}

export interface StartJobOptions {
  command: string;
  args: string[];
  cwd: string;
  /** Short human-readable label, e.g. the pc chunk name. */
  label: string;
  /** Process-level timeout, independent of the MCP transport. */
  timeoutMs: number;
  /**
   * When set, re-invoking with the same key while a matching job is still
   * running returns the existing job instead of spawning a duplicate.
   */
  idempotencyKey?: string;
  /**
   * Run the command through the platform shell. Required on Windows for npm
   * wrapper commands (pnpm/npm/npx) which are `.cmd` batch scripts — spawning
   * them without a shell throws EINVAL since the CVE-2024-27980 hardening.
   * Callers must pre-escape args (see nx-server's cmd-escape.ts) when
   * enabling this.
   */
  shell?: boolean;
  /** Extra environment variables, merged over process.env (PATH preserved). */
  env?: Record<string, string>;
  /**
   * Opt-in timeout recovery. When the process-level timeout fires but the
   * job's log already matches this pattern, the job is finalized as passed
   * (status 'done', exitCode 0) instead of failed — the kill only reaped a
   * process that outlived its completed work (e.g. make/nx teardown after
   * the success line was printed). Only pass a marker that the command
   * prints strictly at the end of its work: a marker an intermediate step
   * can print would mask a hang in a later step.
   */
  successMarker?: RegExp;
  /**
   * Arbitrary metadata persisted with the job. Used by result formatters
   * (meta.kind) to rebuild a tool-specific result when completion is observed
   * later via the server's wait/status tool.
   */
  meta?: Record<string, unknown>;
}

export interface JobSummary {
  jobId: string;
  label: string;
  status: JobStatus;
  elapsedSec: number;
  cwd: string;
}

export interface JobRunnerConfig {
  /** jobId prefix, e.g. 'nx' produces ids like `nx-<epoch>-<rand>`. */
  idPrefix: string;
  /**
   * Directory name under the OS tmpdir holding this runner's log + metadata
   * files, e.g. 'nx-mcp-jobs'. Namespaces persistence per server so one
   * server never lists another server's jobs.
   */
  dirName: string;
  /**
   * Builds the "still running" hint returned on running snapshots — should
   * name the server's wait tool, e.g. nx_job_wait / make_run_wait.
   */
  waitHint: (jobId: string) => string;
}

// Members are function-typed properties (not method signatures): the runner's
// functions are `this`-free closures, and property syntax lets consumers
// destructure them without tripping @typescript-eslint/unbound-method.
export interface JobRunner {
  /** Start a command as a background job. Returns immediately. */
  startJob: (opts: StartJobOptions) => {
    jobId: string;
    logPath: string;
    existing: boolean;
  };
  /** Point-in-time status snapshot; null for an unknown jobId. */
  snapshotJob: (jobId: string) => JobSnapshot | null;
  /**
   * Wait for a job to reach a terminal state, bounded by maxWaitMs (capped at
   * MAX_WAIT_MS). If the job is still running when the budget expires, returns
   * a status:"running" snapshot with a re-arm hint — never an error.
   */
  waitForJob: (
    jobId: string,
    maxWaitMs?: number,
  ) => Promise<JobSnapshot | null>;
  /**
   * Sync-then-handle: start (or join, via idempotencyKey) a job and wait up to
   * syncBudgetMs for it to finish. Fast jobs return their terminal snapshot in
   * one call; slow jobs return a running snapshot with a jobId to poll.
   */
  runJobWithBudget: (
    opts: StartJobOptions,
    syncBudgetMs: number,
  ) => Promise<JobSnapshot>;
  /**
   * List recent jobs (newest first, capped), merging the in-memory registry
   * with on-disk metadata from previous server processes. Use after a session
   * or server restart to recover a lost job handle instead of re-running work.
   */
  listJobs: () => JobSummary[];
}

function readLog(logPath: string): string {
  try {
    return readFileSync(logPath, 'utf-8');
  } catch {
    return '';
  }
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a job's entire process tree. `child.kill()` alone terminates only the
 * direct child (e.g. `make`), leaving nx/node grandchildren running — they
 * contend with any retry via daemon and file locks. On Windows, taskkill /T
 * walks the tree; on POSIX the child is spawned as a process-group leader
 * (detached) so signalling -pid reaches the whole group.
 */
function killJobTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

/** Create a job runner namespaced to one MCP server. */
export function createJobRunner(config: JobRunnerConfig): JobRunner {
  // In-memory registry — authoritative for jobs spawned by this server process.
  const jobRegistry = new Map<string, JobRecord>();
  const idempotencyIndex = new Map<string, string>();

  function jobsDir(): string {
    const dir = join(tmpdir(), config.dirName);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  function newJobId(): string {
    return `${config.idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function logPathFor(jobId: string): string {
    return join(jobsDir(), `${jobId}.log`);
  }

  function metaPathFor(jobId: string): string {
    return join(jobsDir(), `${jobId}.json`);
  }

  /**
   * Sidecar written by the OS-level wrapper process on exit (see
   * `wrapForExitSidecar`) — independent of whether *this* server process is
   * still alive to catch the child's `close` event. Recovers the true
   * pass/fail outcome of a job orphaned by an MCP server restart (LS-8358).
   */
  function exitPathFor(jobId: string): string {
    return join(jobsDir(), `${jobId}.exit`);
  }

  function readExitSidecar(jobId: string): number | null {
    try {
      const raw = readFileSync(exitPathFor(jobId), 'utf-8').trim();
      // Guard the write race: the wrapper's `>` redirect truncates the file
      // before printf/Set-Content writes the code, so a read in that instant
      // sees an empty file. `Number('')` is 0, not NaN — without this check
      // that would misreport a still-running job as a successful exit.
      if (raw === '') return null;
      const code = Number(raw);
      return Number.isInteger(code) ? code : null;
    } catch {
      return null;
    }
  }

  /**
   * Materialize the platform trampoline script into this runner's jobsDir()
   * (idempotent — only written if missing) and return its path. Written per
   * runner rather than shared repo-wide since jobsDir() is namespaced per
   * server and each server's tmpdir may be cleared independently.
   */
  function ensureWrapperScript(): string {
    const isWindows = process.platform === 'win32';
    const path = join(
      jobsDir(),
      isWindows ? 'run-with-exit-sidecar.ps1' : 'run-with-exit-sidecar.sh',
    );
    if (!existsSync(path)) {
      writeFileSync(path, isWindows ? PS_WRAPPER_SCRIPT : SH_WRAPPER_SCRIPT);
    }
    return path;
  }

  /**
   * Build the actual spawn target for a job. Non-shell jobs (the common
   * case) are routed through a platform trampoline (`sh` / `powershell.exe`)
   * that writes `exitPathFor(jobId)` when the wrapped command exits — a real
   * OS-level parent-child relationship, not a Node event handler, so the
   * terminal exit code is captured even if this server process dies first.
   * Args are forwarded as an argv array (never text-joined), so no extra
   * escaping is introduced.
   *
   * Jobs opted into `shell: true` (Windows npm-wrapper `.cmd` commands whose
   * args are pre-escaped by the caller for cmd.exe's text-join semantics, or
   * commands relying on shell metacharacter interpretation) keep today's
   * direct Node `shell:true` spawn unchanged — wrapping them would require
   * re-deriving that escaping, which risks silently corrupting arguments.
   * These jobs still work correctly when the server process survives to see
   * the `close` event; only the cross-restart-recovery improvement below
   * does not extend to them.
   */
  function wrapForExitSidecar(
    opts: StartJobOptions,
    exitPath: string,
  ): { command: string; args: string[]; shell: boolean } {
    if (opts.shell) {
      return { command: opts.command, args: opts.args, shell: true };
    }
    const wrapperPath = ensureWrapperScript();
    if (process.platform === 'win32') {
      return {
        command: 'powershell.exe',
        args: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          wrapperPath,
          exitPath,
          opts.command,
          ...opts.args,
        ],
        shell: false,
      };
    }
    return {
      command: '/bin/sh',
      args: [wrapperPath, exitPath, opts.command, ...opts.args],
      shell: false,
    };
  }

  function persistMeta(record: JobRecord): void {
    const meta: JobMeta = {
      jobId: record.jobId,
      pid: record.pid,
      label: record.label,
      cwd: record.cwd,
      command: record.command,
      args: record.args,
      startTime: record.startTime,
      timeoutMs: record.timeoutMs,
      done: record.done,
      exitCode: record.exitCode,
      error: record.error,
      recoveredFromTimeout: record.recoveredFromTimeout,
      meta: record.meta,
    };
    try {
      writeFileSync(record.metaPath, JSON.stringify(meta));
    } catch {
      // Metadata persistence is best-effort — the in-memory record still works.
    }
  }

  /** Load a job spawned by a previous server process from its on-disk metadata. */
  function loadFromDisk(jobId: string): JobRecord | null {
    const metaPath = metaPathFor(jobId);
    if (!existsSync(metaPath)) return null;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as JobMeta;
      return { ...meta, logPath: logPathFor(jobId), metaPath };
    } catch {
      return null;
    }
  }

  function getRecord(jobId: string): JobRecord | null {
    return jobRegistry.get(jobId) ?? loadFromDisk(jobId);
  }

  function snapshotJob(jobId: string): JobSnapshot | null {
    const record = getRecord(jobId);
    if (!record) return null;

    const elapsedSec = Math.round((Date.now() - record.startTime) / 1000);
    const base = {
      jobId: record.jobId,
      label: record.label,
      cwd: record.cwd,
      elapsedSec,
      exitCode: record.exitCode,
      error: record.error,
      ...(record.meta ? { meta: record.meta } : {}),
      ...(record.recoveredFromTimeout ? { recoveredFromTimeout: true } : {}),
    };

    if (record.done) {
      const failed = record.exitCode !== 0 || record.error !== null;
      return {
        ...base,
        status: failed ? 'failed' : 'done',
        log: readLog(record.logPath),
      };
    }

    // Not marked done. For in-memory jobs the close handler will flip the flag;
    // for disk-recovered jobs from a dead server, completion is never recorded
    // by that mechanism — but the exit-sidecar wrapper (see
    // `wrapForExitSidecar`) records the real outcome independent of the dead
    // process, so check it first and resolve pass/fail from it instead of
    // reporting the job orphaned (LS-8358). Only jobs spawned via the
    // trampoline (opts.shell falsy) have a sidecar; others fall through to
    // the existing orphan heuristics below.
    const inMemory = jobRegistry.has(jobId);
    if (!inMemory) {
      const sidecarExitCode = readExitSidecar(jobId);
      if (sidecarExitCode !== null) {
        const failed = sidecarExitCode !== 0;
        return {
          ...base,
          exitCode: sidecarExitCode,
          error: failed
            ? `${record.label} exited with code ${sidecarExitCode}`
            : null,
          status: failed ? 'failed' : 'done',
          log: readLog(record.logPath),
        };
      }
      const deadlinePassed =
        record.timeoutMs !== undefined &&
        Date.now() - record.startTime > record.timeoutMs;
      if (!isPidAlive(record.pid) || deadlinePassed) {
        return {
          ...base,
          status: 'orphaned',
          logTail: readLog(record.logPath).slice(-LOG_TAIL_CHARS),
          hint: deadlinePassed
            ? 'This job was started by a previous MCP server process and has exceeded its ' +
              'process timeout; its result will never be recorded. Inspect logTail for ' +
              'pass/fail markers; re-run the command if the outcome is unclear.'
            : 'This job was started by a previous MCP server process and has exited, but its ' +
              'result was not recorded. Inspect logTail for pass/fail markers; re-run the ' +
              'command if the outcome is unclear.',
        };
      }
    }

    return {
      ...base,
      status: 'running',
      logTail: readLog(record.logPath).slice(-LOG_TAIL_CHARS),
      hint: config.waitHint(jobId),
    };
  }

  /**
   * The child's stdout/stderr are attached directly to the log file descriptor
   * (not piped through this process), so the log keeps growing even if the MCP
   * server restarts while the job runs.
   */
  function startJob(opts: StartJobOptions): {
    jobId: string;
    logPath: string;
    existing: boolean;
  } {
    if (opts.idempotencyKey) {
      const existingId = idempotencyIndex.get(opts.idempotencyKey);
      if (existingId) {
        const existing = jobRegistry.get(existingId);
        if (existing && !existing.done) {
          return {
            jobId: existingId,
            logPath: existing.logPath,
            existing: true,
          };
        }
        idempotencyIndex.delete(opts.idempotencyKey);
      }
    }

    const jobId = newJobId();
    const logPath = logPathFor(jobId);
    const metaPath = metaPathFor(jobId);
    const exitPath = exitPathFor(jobId);
    const spawnTarget = wrapForExitSidecar(opts, exitPath);
    // Open for write, NOT append: MSYS/Git-Bash children (e.g. make recipes
    // running under sh.exe on Windows) fail writing to an inherited
    // append-mode handle ("echo: write error: Bad file descriptor"). The log
    // file is unique per jobId, so append mode buys nothing.
    const fd = openSync(logPath, 'w');

    const child = (() => {
      try {
        return spawn(spawnTarget.command, spawnTarget.args, {
          cwd: opts.cwd,
          stdio: ['ignore', fd, fd],
          windowsHide: true,
          shell: spawnTarget.shell,
          ...(opts.env
            ? {
                env: {
                  ...process.env,
                  ...opts.env,
                  // Preserve the host PATH so spawned processes can find
                  // binaries even if the caller-supplied env includes a
                  // PATH/Path key (mirrors nx-server's run-command.ts).
                  ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
                  ...(process.env.Path ? { Path: process.env.Path } : {}),
                },
              }
            : {}),
          // POSIX: make the child a process-group leader so killJobTree can
          // signal the whole tree via -pid. Windows tree-kill uses taskkill /T.
          detached: process.platform !== 'win32',
        });
      } finally {
        // The child holds its own copy of the descriptor.
        closeSync(fd);
      }
    })();

    const record: JobRecord = {
      jobId,
      pid: child.pid ?? 0,
      label: opts.label,
      cwd: opts.cwd,
      command: opts.command,
      args: opts.args,
      startTime: Date.now(),
      timeoutMs: opts.timeoutMs,
      done: false,
      exitCode: null,
      error: null,
      meta: opts.meta,
      logPath,
      metaPath,
    };
    jobRegistry.set(jobId, record);
    if (opts.idempotencyKey) {
      idempotencyIndex.set(opts.idempotencyKey, jobId);
    }
    persistMeta(record);

    // Enforce a process-level timeout independent of the MCP client transport.
    let recoveredFromTimeout = false;
    const timer = setTimeout(() => {
      killJobTree(child);
      record.done = true;
      // The timeout can fire after the command's work already succeeded (the
      // process outliving its success line, e.g. nx worker teardown). When the
      // caller opted in with a successMarker and the log already matches it,
      // finalize as passed instead of failed (LS-8320).
      if (opts.successMarker?.test(readLog(logPath))) {
        recoveredFromTimeout = true;
        record.recoveredFromTimeout = true;
        record.exitCode = 0;
        record.error = null;
      } else {
        record.error = `Process killed after ${opts.timeoutMs}ms (internal timeout)`;
      }
      persistMeta(record);
    }, opts.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      record.done = true;
      record.error = `Failed to spawn ${opts.command}: ${err.message}`;
      persistMeta(record);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // The kill issued by the recovery branch surfaces here as a non-zero /
      // null exit — don't let it clobber the recovered success.
      if (recoveredFromTimeout) {
        persistMeta(record);
        return;
      }
      record.exitCode = code;
      record.done = true;
      if (code !== 0 && !record.error) {
        record.error = `${opts.label} exited with code ${code}`;
      }
      persistMeta(record);
    });

    return { jobId, logPath, existing: false };
  }

  async function waitForJob(
    jobId: string,
    maxWaitMs = MAX_WAIT_MS,
  ): Promise<JobSnapshot | null> {
    const deadline = Date.now() + Math.min(maxWaitMs, MAX_WAIT_MS);
    let snapshot = snapshotJob(jobId);
    while (snapshot && snapshot.status === 'running' && Date.now() < deadline) {
      await new Promise<void>((r) =>
        setTimeout(
          r,
          Math.min(POLL_INTERVAL_MS, Math.max(deadline - Date.now(), 1)),
        ),
      );
      snapshot = snapshotJob(jobId);
    }
    return snapshot;
  }

  async function runJobWithBudget(
    opts: StartJobOptions,
    syncBudgetMs: number,
  ): Promise<JobSnapshot> {
    const { jobId } = startJob(opts);
    const snapshot = await waitForJob(jobId, syncBudgetMs);
    // The job was just started/joined, so the registry lookup cannot miss.
    return snapshot as JobSnapshot;
  }

  function listJobs(): JobSummary[] {
    const ids = new Set<string>(jobRegistry.keys());
    try {
      for (const file of readdirSync(jobsDir())) {
        if (file.endsWith('.json')) ids.add(file.slice(0, -'.json'.length));
      }
    } catch {
      // Directory unreadable — fall back to in-memory jobs only.
    }

    const summaries: Array<JobSummary & { startTime: number }> = [];
    for (const jobId of ids) {
      const record = getRecord(jobId);
      if (!record) continue;
      const snapshot = snapshotJob(jobId);
      if (!snapshot) continue;
      summaries.push({
        jobId,
        label: record.label,
        status: snapshot.status,
        elapsedSec: snapshot.elapsedSec,
        cwd: record.cwd,
        startTime: record.startTime,
      });
    }

    return summaries
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, JOB_LIST_LIMIT)
      .map((s) => ({
        jobId: s.jobId,
        label: s.label,
        status: s.status,
        elapsedSec: s.elapsedSec,
        cwd: s.cwd,
      }));
  }

  return { startJob, snapshotJob, waitForJob, runJobWithBudget, listJobs };
}
