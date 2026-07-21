import { minifiedJson } from '@legacy-sports/mcp-format';
import { join, isAbsolute, resolve, relative } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { runCommand, getRepoRoot } from '../run-command.js';
import {
  startMakeInBackground,
  waitForJobDone,
  readJobLog,
} from './make-run-bg.js';
import {
  parseSteps,
  extractErrors,
  truncateOutput,
  MAX_OUTPUT_CHARS,
} from './run-target-utils.js';
import type { ToolResult } from '../types.js';

interface ValidatePRParams {
  /** Absolute path to the worktree (default: repo root). */
  worktreePath?: string;
  /**
   * When true, runs the seven sanctioned pc chunks in order instead of `make pc`.
   * Required for cloud sessions where the MCP transport timeout (~60s) would kill
   * a synchronous `make pc` call. The call is budgeted to stay under that timeout:
   * it runs as many chunks as fit, then returns { status: "in_progress" } with
   * resume instructions (startAtChunk, or a jobId for a chunk still running).
   */
  sanctionedChunks?: boolean;
  /**
   * Resume sanctioned-chunk validation at this chunk (skips migration checks —
   * they ran in the initial call). Use the value from a previous in_progress
   * result. Implies sanctionedChunks: true.
   */
  startAtChunk?: (typeof PC_CHUNKS)[number];
  /**
   * When true, spawn `make pc` in the background and return a jobId immediately.
   * Use make_run_wait({ jobId }) to poll for completion.
   * Recommended for cloud sessions. Takes precedence over sanctionedChunks.
   */
  runPcInBackground?: boolean;
}

/** Migration filename shape from lib/db-client/migrations. */
const MIGRATION_FILE_RE = /^\d{8}_\d{6}_.+\.ts$/;

/** Read local migration filenames to pass to db:status for pending diff. */
function collectMigrationNames(repoRoot: string): string[] {
  const migrationsDir = join(repoRoot, 'lib', 'db-client', 'migrations');
  try {
    return readdirSync(migrationsDir)
      .filter((f) => MIGRATION_FILE_RE.test(f))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

interface MigrationStatusResult {
  available: boolean;
  reason: string | null;
  applied: number | null;
  pending: number | null;
  pendingNames: string[];
  needsMigration: boolean | null;
}

/** Run pnpm db:status and parse the JSON output. */
async function checkMigrationStatus(
  repoRoot: string,
  workDir: string,
): Promise<MigrationStatusResult> {
  const migrationNames = collectMigrationNames(repoRoot);
  try {
    const output = await runCommand(
      'pnpm',
      [
        '--prefix',
        join(repoRoot, 'lib', 'db-client'),
        'run',
        'db:status',
        '--json',
      ],
      workDir,
      30_000,
      true,
    );
    try {
      const parsed = JSON.parse(output.trim());
      // If the CLI outputs structured JSON, use it directly
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'needsMigration' in parsed
      ) {
        return parsed as MigrationStatusResult;
      }
    } catch {
      // Not JSON — parse the text output
    }
    // Fall back: treat any output as "status unknown, run migrate to be safe"
    const hasPending = /pending/i.test(output) && !/0 pending/i.test(output);
    return {
      available: true,
      reason: null,
      applied: null,
      pending: hasPending ? 1 : 0,
      pendingNames: migrationNames,
      needsMigration: hasPending,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // db:status failing (e.g. DB unreachable) should not block pc — surface as warning
    return {
      available: false,
      reason: `db:status failed: ${msg}`,
      applied: null,
      pending: null,
      pendingNames: [],
      needsMigration: null,
    };
  }
}

/** Run pnpm db:up to apply pending migrations. */
async function applyMigrations(
  repoRoot: string,
  workDir: string,
): Promise<string> {
  return runCommand(
    'pnpm',
    ['--prefix', join(repoRoot, 'lib', 'db-client'), 'run', 'db:up'],
    workDir,
    120_000,
    true,
  );
}

const PC_CHUNKS = [
  'pc-db-prep',
  'pc-typecheck',
  'pc-format',
  'pc-lint',
  'pc-workflows',
  'pc-test',
  'pc-build',
] as const;

// Single-call budget for sanctioned-chunk mode — stays safely under the ~60s
// MCP transport timeout in cloud sessions. Chunks beyond the budget resume via
// startAtChunk; a chunk still running at the deadline is handed back as a
// background jobId.
const CHUNK_SYNC_BUDGET_MS = 45_000;

/**
 * Semantic one-shot for the mandatory migrate-before-pc gate.
 *
 * Replaces the three-step chain: db_migration_status → db_migrate → make_run({ target: 'pc' }).
 * Guarantees the invariant order and short-circuits on migration failure (does not run pc on
 * a broken DB). Every mode runs make pc as a background job (LS-8558): the default waits out
 * a bounded sync budget and hands back a jobId when pc is still running; `runPcInBackground`
 * skips the bounded wait and returns the jobId immediately. Poll with make_run_wait({ jobId }).
 */
function err(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export async function validatePR(
  params: ValidatePRParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  let workDir = repoRoot;

  if (params.worktreePath) {
    if (!isAbsolute(params.worktreePath)) {
      return err(
        `worktreePath must be an absolute path, got: "${params.worktreePath}"`,
      );
    }
    const resolved = resolve(params.worktreePath);
    if (!existsSync(resolved)) {
      return err(`worktreePath does not exist: "${resolved}"`);
    }
    const rel = relative(repoRoot, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return err(
        `worktreePath "${resolved}" is outside the repository root "${repoRoot}". Only paths within the repository are allowed.`,
      );
    }
    workDir = resolved;
  }

  if (params.startAtChunk && !PC_CHUNKS.includes(params.startAtChunk)) {
    return err(
      `startAtChunk must be one of: ${PC_CHUNKS.join(', ')} — got "${params.startAtChunk}"`,
    );
  }

  // ── Step 1 + 2: Migration status / apply ────────────────────────────────────
  // Skipped on startAtChunk resume — migrations were handled in the initial call.
  const migrationResult: Record<string, unknown> = {};
  if (params.startAtChunk) {
    migrationResult.skipped = true;
    migrationResult.reason =
      'startAtChunk resume — migrations were checked in the initial call';
  } else {
    const migrationStatus = await checkMigrationStatus(repoRoot, workDir);

    migrationResult.available = migrationStatus.available;
    migrationResult.applied = migrationStatus.applied;
    migrationResult.pending = migrationStatus.pending;
    migrationResult.needsMigration = migrationStatus.needsMigration;
    if (migrationStatus.reason) migrationResult.reason = migrationStatus.reason;
    if (migrationStatus.pendingNames.length > 0) {
      migrationResult.pendingNames = migrationStatus.pendingNames;
    }

    if (migrationStatus.needsMigration === true) {
      let migrateOutput = '';
      let migrateSuccess = false;
      try {
        migrateOutput = await applyMigrations(repoRoot, workDir);
        migrateSuccess = true;
        migrationResult.migrated = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: minifiedJson({
                migrations: {
                  ...migrationResult,
                  migrateOutput: msg,
                  migrateSuccess: false,
                },
                pc: null,
                error:
                  'Migration failed — aborting pc to avoid validating a broken DB state.',
              }),
            },
          ],
        };
      }
      migrationResult.migrateOutput = truncateOutput(migrateOutput, 2_000);
      migrationResult.migrateSuccess = migrateSuccess;
    }
  }

  // ── Step 3: Run make pc ──────────────────────────────────────────────────────

  // Background mode: return jobId immediately so caller can poll with make_run_wait.
  if (params.runPcInBackground) {
    const { jobId, logPath } = startMakeInBackground(
      ['pc'],
      'pc',
      workDir,
      900_000,
    );
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: {
              status: 'running',
              jobId,
              logPath,
              message:
                'make pc started in background. Use make_run_wait({ jobId }) to wait for completion.',
            },
          }),
        },
      ],
    };
  }

  // Sanctioned chunks mode: run pc steps individually, budgeted to stay under
  // the ~60s MCP transport timeout. Runs as many chunks as fit in the budget,
  // then returns an in_progress result with resume instructions instead of
  // blocking into the transport deadline.
  if (params.sanctionedChunks || params.startAtChunk) {
    const budgetDeadline = Date.now() + CHUNK_SYNC_BUDGET_MS;
    const startIndex = params.startAtChunk
      ? PC_CHUNKS.indexOf(params.startAtChunk)
      : 0;
    const chunkResults: Array<{
      target: string;
      passed: boolean;
      output: string;
    }> = [];

    const inProgress = (pc: Record<string, unknown>): ToolResult => ({
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: { status: 'in_progress', chunks: chunkResults, ...pc },
          }),
        },
      ],
    });

    for (let i = startIndex; i < PC_CHUNKS.length; i++) {
      const chunk = PC_CHUNKS[i];
      const nextChunk = PC_CHUNKS[i + 1];

      const { jobId } = startMakeInBackground([chunk], chunk, workDir, 300_000);
      const record = await waitForJobDone(
        jobId,
        Math.max(budgetDeadline - Date.now(), 1_000),
      );

      if (record && !record.done) {
        // Budget expired mid-chunk — the chunk keeps running in the background.
        return inProgress({
          currentChunk: chunk,
          jobId,
          hint:
            `Chunk ${chunk} is still running as background job ${jobId}. ` +
            `Call make_run_wait({ jobId: "${jobId}" }) until it completes. ` +
            (nextChunk
              ? `If it passed, re-invoke validate_pr({ sanctionedChunks: true, startAtChunk: "${nextChunk}" }) to run the remaining chunks. `
              : 'If it passed, validation is complete. ') +
            `If it failed, fix the errors and re-invoke validate_pr({ sanctionedChunks: true, startAtChunk: "${chunk}" }).`,
        });
      }

      const log = record ? readJobLog(record) : '';
      const failed = !record || record.exitCode !== 0 || record.error !== null;
      chunkResults.push({
        target: chunk,
        passed: !failed,
        output: truncateOutput(log, 2_000),
      });

      if (failed) {
        // Stop-on-first-failure — same semantics as make pc
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: minifiedJson({
                migrations: migrationResult,
                pc: {
                  passed: false,
                  failedTarget: chunk,
                  chunks: chunkResults,
                  errors: extractErrors(log),
                  ...(record?.error ? { error: record.error } : {}),
                },
              }),
            },
          ],
        };
      }

      // Budget check before starting the next chunk.
      if (nextChunk && Date.now() >= budgetDeadline) {
        return inProgress({
          nextChunk,
          hint:
            `Sync budget exhausted after ${chunkResults.length} chunk(s) — no chunk is currently running. ` +
            `Re-invoke validate_pr({ sanctionedChunks: true, startAtChunk: "${nextChunk}" }) to continue.`,
        });
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: { passed: true, chunks: chunkResults },
          }),
        },
      ],
    };
  }

  // Default: budgeted background `make pc`. The old synchronous path blocked
  // up to 900s and was killed by the ~60s MCP transport timeout in cloud
  // sessions; now the monolithic pc always runs as a background job, waits
  // out the remaining sync budget, and hands back a jobId when still running.
  const { jobId, logPath } = startMakeInBackground(
    ['pc'],
    'pc',
    workDir,
    900_000,
  );
  const record = await waitForJobDone(jobId, CHUNK_SYNC_BUDGET_MS);

  if (record && !record.done) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: {
              status: 'running',
              jobId,
              logPath,
              hint:
                `make pc is running as background job ${jobId}. ` +
                `Call make_run_wait({ jobId: "${jobId}" }) until it completes — ` +
                'do NOT re-invoke validate_pr while it runs.',
            },
          }),
        },
      ],
    };
  }

  const pcLog = record ? readJobLog(record) : '';
  const timedOut =
    record?.error != null && /internal timeout/i.test(record.error);
  const steps = parseSteps(pcLog);
  const hasPassedMarker = /All pre-commit checks passed/i.test(pcLog);
  const anyStepFailed = steps.some((s) => s.status === 'failed');
  const passed =
    record != null &&
    record.exitCode === 0 &&
    record.error === null &&
    !anyStepFailed &&
    (hasPassedMarker || steps.length === 0);
  const errors = passed ? [] : extractErrors(pcLog);
  return {
    isError: !passed,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          migrations: migrationResult,
          pc: {
            passed,
            ...(timedOut ? { timedOut: true } : {}),
            steps: steps.length > 0 ? steps : undefined,
            errors: errors.length > 0 ? errors : undefined,
            ...(record?.error ? { error: record.error } : {}),
            output: truncateOutput(pcLog, MAX_OUTPUT_CHARS),
          },
        }),
      },
    ],
  };
}
