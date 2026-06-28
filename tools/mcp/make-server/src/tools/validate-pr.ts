import { minifiedJson } from '@legacy-sports/mcp-format';
import { join, isAbsolute, resolve, relative } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import {
  runCommand,
  runMake,
  getRepoRoot,
  TimeoutError,
} from '../run-command.js';
import { startMakeInBackground } from './make-run-bg.js';
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
   * a synchronous `make pc` call. Each chunk returns independently.
   */
  sanctionedChunks?: boolean;
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

/**
 * Semantic one-shot for the mandatory migrate-before-pc gate.
 *
 * Replaces the three-step chain: db_migration_status → db_migrate → make_run({ target: 'pc' }).
 * Guarantees the invariant order and short-circuits on migration failure (does not run pc on
 * a broken DB). The `runPcInBackground` flag spawns make pc as a background job — use this
 * in cloud sessions where the ~60s MCP transport timeout would kill a synchronous pc call;
 * poll with make_run_wait({ jobId }).
 *
 * Note: LS-8052 (make_run timeout increase) must land for synchronous mode to reliably
 * complete `make pc`. Until then, use runPcInBackground: true.
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

  // ── Step 1: Migration status ─────────────────────────────────────────────────
  const migrationStatus = await checkMigrationStatus(repoRoot, workDir);

  const migrationResult: Record<string, unknown> = {
    available: migrationStatus.available,
    applied: migrationStatus.applied,
    pending: migrationStatus.pending,
    needsMigration: migrationStatus.needsMigration,
  };
  if (migrationStatus.reason) migrationResult.reason = migrationStatus.reason;
  if (migrationStatus.pendingNames.length > 0) {
    migrationResult.pendingNames = migrationStatus.pendingNames;
  }

  // ── Step 2: Apply migrations if needed ──────────────────────────────────────
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

  // Sanctioned chunks mode: run each pc step individually (timeout-resilient for cloud).
  if (params.sanctionedChunks) {
    const chunkResults: Array<{
      target: string;
      passed: boolean;
      output: string;
    }> = [];
    for (const chunk of PC_CHUNKS) {
      try {
        const output = await runMake([chunk], workDir, 300_000);
        chunkResults.push({
          target: chunk,
          passed: true,
          output: truncateOutput(output, 2_000),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        chunkResults.push({
          target: chunk,
          passed: false,
          output: truncateOutput(msg, 2_000),
        });
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
                  errors: extractErrors(msg),
                },
              }),
            },
          ],
        };
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

  // Synchronous make pc
  try {
    const pcOutput = await runMake(['pc'], workDir, 900_000);
    const steps = parseSteps(pcOutput);
    const hasPassedMarker = /All pre-commit checks passed/i.test(pcOutput);
    const failed = steps.filter((s) => s.status === 'failed');
    const passed =
      failed.length === 0 && (hasPassedMarker || steps.length === 0);
    return {
      isError: !passed,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: {
              passed,
              steps: steps.length > 0 ? steps : undefined,
              output: truncateOutput(pcOutput, MAX_OUTPUT_CHARS),
            },
          }),
        },
      ],
    };
  } catch (e) {
    if (e instanceof TimeoutError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: minifiedJson({
              migrations: migrationResult,
              pc: {
                passed: false,
                timedOut: true,
                partialOutput: truncateOutput(
                  e.partialOutput,
                  MAX_OUTPUT_CHARS,
                ),
                hint: 'Pass runPcInBackground: true to avoid MCP transport timeout on heavy targets.',
              },
            }),
          },
        ],
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    const steps = parseSteps(msg);
    const errors = extractErrors(msg);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            migrations: migrationResult,
            pc: {
              passed: false,
              steps: steps.length > 0 ? steps : undefined,
              errors: errors.length > 0 ? errors : undefined,
              output: truncateOutput(msg, MAX_OUTPUT_CHARS),
            },
          }),
        },
      ],
    };
  }
}
