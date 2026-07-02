import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { minifiedJson } from '@legacy-sports/mcp-format';
import type { ToolResult } from '../types.js';
import {
  MAX_OUTPUT_CHARS,
  STRUCTURED_TARGETS,
  parseSteps,
  extractErrors,
  truncateOutput,
  buildCompactOutput,
} from './run-target-utils.js';

export interface JobRecord {
  pid: number;
  logPath: string;
  startTime: number;
  target: string;
  workDir: string;
  exitCode: number | null;
  done: boolean;
  error: string | null;
  verbose: boolean;
}

// In-memory registry — lives for the lifetime of the MCP server process.
const jobRegistry = new Map<string, JobRecord>();

function newJobId(): string {
  return `make-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureLogDir(): string {
  const dir = join(tmpdir(), 'make-run-jobs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readLog(logPath: string): string {
  try {
    return readFileSync(logPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Start a make target in the background. Returns immediately with a jobId.
 * Use make_run_status or make_run_wait to poll for completion.
 */
export function startMakeInBackground(
  args: string[],
  target: string,
  workDir: string,
  timeoutMs: number,
  verbose = false,
): { jobId: string; logPath: string } {
  const jobId = newJobId();
  const logPath = join(ensureLogDir(), `${jobId}.log`);
  const logStream = createWriteStream(logPath);

  const child = spawn('make', args, {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const record: JobRecord = {
    pid: child.pid ?? 0,
    logPath,
    startTime: Date.now(),
    target,
    workDir,
    exitCode: null,
    done: false,
    error: null,
    verbose,
  };
  jobRegistry.set(jobId, record);

  // end: false on both pipes — stdout and stderr share one destination, and the
  // default end-on-source-end would close the stream when the first source
  // finishes while the other may still write ("write after end"). The stream is
  // ended explicitly in the 'close' handler / timeout path instead.
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });
  // Late writes after an explicit end() (e.g. a killed child flushing) must not
  // crash the server process via an unhandled 'error' event.
  logStream.on('error', () => {});

  // Enforce a process-level timeout independent of the MCP client transport.
  const timer = setTimeout(() => {
    child.kill();
    record.done = true;
    record.error = `Process killed after ${timeoutMs}ms (internal timeout)`;
    logStream.end();
  }, timeoutMs);

  child.on('close', (code) => {
    clearTimeout(timer);
    record.exitCode = code;
    record.done = true;
    if (code !== 0 && !record.error) {
      record.error = `make ${target} exited with code ${code}`;
    }
    logStream.end();
  });

  return { jobId, logPath };
}

function buildStatusResult(record: JobRecord, full: boolean): ToolResult {
  const log = readLog(record.logPath);
  const elapsedSec = Math.round((Date.now() - record.startTime) / 1000);

  if (!record.done) {
    const logTail = log.slice(-5000);
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'running',
            target: record.target,
            elapsedSec,
            logTail,
            hint:
              'Job still running. Re-invoke make_run_wait({ jobId }) to continue waiting ' +
              '(each call waits up to 55s and returns a status snapshot — never an error ' +
              'while the job is in progress). Do NOT re-run the target.',
          }),
        },
      ],
    };
  }

  const output = full ? log : log.slice(-5000);

  if (STRUCTURED_TARGETS.has(record.target)) {
    const steps = parseSteps(log);
    const hasPassedMarker = /All pre-commit checks passed/i.test(log);
    const failedCount = steps.filter((s) => s.status === 'failed').length;
    const anyStepFailed = failedCount > 0;
    const success =
      record.exitCode === 0 &&
      !record.error &&
      !anyStepFailed &&
      (hasPassedMarker || steps.length === 0);

    const result: Record<string, unknown> = {
      status: record.done ? (success ? 'done' : 'failed') : 'running',
      success,
      target: record.target,
      worktreePath: record.workDir,
      elapsedSec,
      summary: success
        ? `${record.target} passed${steps.length > 0 ? ` (${steps.length} steps)` : ''}`
        : `${record.target} failed${failedCount > 0 ? ` (${failedCount} step${failedCount === 1 ? '' : 's'} failed)` : ''}`,
    };
    if (steps.length > 0) result.steps = steps;
    if (!success) {
      const errors = extractErrors(log);
      if (errors.length > 0) result.errors = errors;
    }
    result.output = record.verbose
      ? truncateOutput(output, MAX_OUTPUT_CHARS)
      : buildCompactOutput(output, MAX_OUTPUT_CHARS);

    return {
      content: [{ type: 'text', text: minifiedJson(result) }],
      isError: !success,
    };
  }

  const success = record.exitCode === 0 && !record.error;
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          status: record.done ? (success ? 'done' : 'failed') : 'running',
          success,
          target: record.target,
          worktreePath: record.workDir,
          elapsedSec,
          ...(record.error ? { error: record.error } : {}),
          output: record.verbose
            ? truncateOutput(output, MAX_OUTPUT_CHARS)
            : buildCompactOutput(output, MAX_OUTPUT_CHARS),
        }),
      },
    ],
    isError: !success,
  };
}

/**
 * Internal helper for other tools (e.g. validate_pr): wait for a job to
 * complete, bounded by maxWaitMs, and return its raw record (which may still
 * be running when the budget expires). Returns null for an unknown jobId.
 */
export async function waitForJobDone(
  jobId: string,
  maxWaitMs: number,
): Promise<JobRecord | null> {
  const POLL_INTERVAL_MS = 1_000;
  const record = jobRegistry.get(jobId);
  if (!record) return null;
  const deadline = Date.now() + maxWaitMs;
  while (!record.done && Date.now() < deadline) {
    await new Promise<void>((r) =>
      setTimeout(
        r,
        Math.min(POLL_INTERVAL_MS, Math.max(deadline - Date.now(), 1)),
      ),
    );
  }
  return record;
}

/** Read the full log for a job record. Exported for internal tool reuse. */
export function readJobLog(record: JobRecord): string {
  return readLog(record.logPath);
}

// ---- make_run_status ----

export interface MakeRunStatusParams {
  jobId: string;
}

export function makeRunStatus(params: MakeRunStatusParams): ToolResult {
  const record = jobRegistry.get(params.jobId);
  if (!record) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: false,
            error: `Job "${params.jobId}" not found. Job records exist only for the lifetime of this MCP server process.`,
          }),
        },
      ],
      isError: true,
    };
  }
  return buildStatusResult(record, true);
}

// ---- make_run_wait ----

export interface MakeRunWaitParams {
  jobId: string;
  maxWaitMs?: number;
}

/**
 * Block until the job completes or maxWaitMs elapses (default 50 000ms).
 * Capped at 55 000ms to stay under the MCP transport timeout of ~60s in cloud sessions.
 * If still running when the wait expires, returns a status: "running" snapshot so
 * the caller can re-invoke make_run_wait to continue waiting.
 */
export async function makeRunWait(
  params: MakeRunWaitParams,
): Promise<ToolResult> {
  const POLL_INTERVAL_MS = 1_000;
  // Cap at 55s to stay safely under the ~60s MCP transport timeout in cloud sessions.
  const MAX_SAFE_WAIT_MS = 55_000;
  const maxWaitMs = Math.min(
    params.maxWaitMs ?? MAX_SAFE_WAIT_MS,
    MAX_SAFE_WAIT_MS,
  );

  const record = jobRegistry.get(params.jobId);
  if (!record) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: false,
            error: `Job "${params.jobId}" not found. Job records exist only for the lifetime of this MCP server process.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const waitStart = Date.now();
  while (!record.done) {
    if (Date.now() - waitStart >= maxWaitMs) {
      // Return a running snapshot — caller should re-invoke make_run_wait.
      return buildStatusResult(record, false);
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return buildStatusResult(record, true);
}
