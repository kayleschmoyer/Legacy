import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { randomUUID } from 'node:crypto';

import { stripAnsiCodes } from '../ansi.js';
import { DAEMON_FAILURE_HINT, isDaemonFailure } from '../daemon-failure.js';
import { registerJobFormatter } from '../job-formatters.js';
import type { FormattedJobResult } from '../job-formatters.js';
import type { JobSnapshot } from '../jobs.js';
import { parseJestJsonReport } from '../jest-report.js';
import { buildProjectNotFoundHint } from '../project-resolution.js';
import {
  MAX_OUTPUT_CHARS,
  truncateOutputPreferTail,
} from '../truncate-output.js';

/** Output shape requested by nx_run_test's `report` param (LS-10092). */
export type JestReportMode = 'summary' | 'json';

export interface JestReportRequest {
  mode: JestReportMode;
  /** Absolute path Jest is told to write its `--json` report to. */
  outputFile: string;
}

/** Job metadata written by runTarget so nx_job_wait can format identically. */
export const JEST_REPORT_JOB_KIND = 'jest-report';

interface JestReportJobMeta {
  mode?: unknown;
  outputFile?: unknown;
  project?: unknown;
  target?: unknown;
  cwd?: unknown;
}

const REPORT_UNAVAILABLE_HINT =
  'Jest wrote no parsable --json report for this run (an Nx cache replay ' +
  'does not re-run Jest, and a target that is not a Jest executor never ' +
  'writes one). The raw output is returned instead — re-run with ' +
  'noCache: true if you need the structured failure list.';

/** Allocate a unique temp path for one run's Jest report. */
export function newJestReportFile(): string {
  return path.join(os.tmpdir(), `nx-mcp-jest-report-${randomUUID()}.json`);
}

/**
 * Read and delete the report file. Returns null when it is missing or
 * unparsable — the caller falls back to raw output rather than reporting a
 * structured green that Jest never confirmed.
 */
async function readReportFile(outputFile: string) {
  let raw: string;
  try {
    raw = await readFile(outputFile, 'utf-8');
  } catch {
    return null;
  } finally {
    // Best-effort cleanup; a leftover temp file must never fail the tool.
    await rm(outputFile, { force: true }).catch(() => undefined);
  }
  return parseJestJsonReport(raw);
}

/**
 * Build the structured jest result body from a terminal job snapshot. Shared
 * between the inline (within sync budget) path in runTarget and the deferred
 * nx_job_wait / nx_job_status formatter, so a slow suite returns the same
 * report either way (the LS-9814 lesson — a formatter registered for only the
 * inline path leaves exactly the long runs, the ones most likely to overflow,
 * on the raw-log path).
 */
export async function buildJestReportResult(
  snapshot: JobSnapshot,
): Promise<FormattedJobResult> {
  const meta = (snapshot.meta ?? {}) as JestReportJobMeta;
  const mode: JestReportMode = meta.mode === 'summary' ? 'summary' : 'json';
  const outputFile =
    typeof meta.outputFile === 'string' ? meta.outputFile : null;
  const project = typeof meta.project === 'string' ? meta.project : undefined;
  const target = typeof meta.target === 'string' ? meta.target : undefined;
  const cwd = typeof meta.cwd === 'string' ? meta.cwd : null;

  const rawOutput = stripAnsiCodes(snapshot.log ?? '');
  // A daemon that fails to compute the project graph still exits 0 (LS-8819),
  // so status alone would report a false green on zero tasks run.
  const daemonFailed = snapshot.status === 'done' && isDaemonFailure(rawOutput);
  const passed = snapshot.status === 'done' && !daemonFailed;

  const report = outputFile ? await readReportFile(outputFile) : null;
  // The report's own `success` flag is dropped in favour of the run-status
  // `passed` above: nx's exit code also covers the failure modes Jest never
  // sees (a daemon bail, a crashed worker, a non-zero pre-step).
  const reportFields = report
    ? {
        numTotalTests: report.numTotalTests,
        numPassedTests: report.numPassedTests,
        numFailedTests: report.numFailedTests,
        numFailedTestSuites: report.numFailedTestSuites,
        failures: report.failures,
        ...(report.omittedFailures != null
          ? { omittedFailures: report.omittedFailures }
          : {}),
      }
    : null;

  const projectNotFoundHint =
    !passed && !daemonFailed && cwd
      ? await buildProjectNotFoundHint(rawOutput, cwd)
      : undefined;

  // `summary` drops the raw log entirely once the structured report is in
  // hand — that is the whole point of the mode. Everything else keeps it,
  // tail-biased so the failure summary survives truncation.
  const includeOutput = report == null || mode === 'json';

  return {
    body: {
      ...(project ? { project } : {}),
      ...(target ? { target } : {}),
      passed,
      ...(daemonFailed ? { daemonError: true, hint: DAEMON_FAILURE_HINT } : {}),
      ...(snapshot.error ? { error: snapshot.error } : {}),
      ...(reportFields ?? { reportUnavailable: REPORT_UNAVAILABLE_HINT }),
      ...(!daemonFailed && projectNotFoundHint
        ? { hint: projectNotFoundHint }
        : {}),
      ...(includeOutput
        ? { output: truncateOutputPreferTail(rawOutput, MAX_OUTPUT_CHARS) }
        : {}),
    },
    isError: !passed,
  };
}

// Deferred-completion formatter: a report-mode run still going when the sync
// budget expires, observed later via nx_job_wait / nx_job_status, gets the
// same structured body the inline path would have returned.
registerJobFormatter(JEST_REPORT_JOB_KIND, (snapshot) =>
  buildJestReportResult(snapshot),
);
