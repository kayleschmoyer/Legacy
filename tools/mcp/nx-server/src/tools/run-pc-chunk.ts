import { minifiedJson } from '@legacy-sports/mcp-format';
import { runJobWithBudget } from '../jobs.js';
import { getRepoRoot } from '../run-command.js';
import {
  MAX_OUTPUT_CHARS,
  buildCompactOutput,
  truncateOutput,
} from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// 30-minute process timeout — a runaway backstop only, NOT a transport guard (that is the
// sync budget + bounded nx_job_wait calls). It must never fire on legitimate work: a cold
// Nx cache (every fresh worktree/cloud session) can push a single chunk past 5 minutes,
// and killing it forces a retry loop that never converges when one task alone exceeds the
// cap (LS-8353).
const PC_CHUNK_TIMEOUT_MS = 30 * 60 * 1000;
// pc-lint and pc-test routinely cover the whole monorepo (30-40 projects when the
// affected base pulls in everything), the slowest chunks by far — give them extra
// headroom over the backstop so a slow-but-succeeding run is never killed (LS-8320).
const HEAVY_PC_CHUNK_TIMEOUT_MS = 45 * 60 * 1000;
// Single-call sync budget — stays safely under the ~60s MCP transport timeout in cloud
// sessions. Chunks that finish inside the budget return their result in one call; slower
// chunks return a running snapshot with a jobId to poll via nx_job_wait.
const SYNC_BUDGET_MS = 45_000;

export const PC_CHUNKS = [
  'pc-db-prep',
  'pc-typecheck',
  'pc-format',
  'pc-lint',
  'pc-workflows',
  'pc-test',
  'pc-build',
] as const;
export type PcChunk = (typeof PC_CHUNKS)[number];

// The two chunks whose recipe is a single nx invocation with nothing after it —
// their nx success line is a trustworthy end-of-work marker, and they are the
// only chunks observed to outlive the process timeout after nx already passed.
const HEAVY_PC_CHUNKS: ReadonlySet<PcChunk> = new Set(['pc-lint', 'pc-test']);

/** Process-level timeout for a chunk — heavy full-monorepo chunks get more headroom. */
export function getTimeoutForChunk(chunk: PcChunk): number {
  return HEAVY_PC_CHUNKS.has(chunk)
    ? HEAVY_PC_CHUNK_TIMEOUT_MS
    : PC_CHUNK_TIMEOUT_MS;
}

/**
 * Timeout-recovery marker for a chunk, or undefined for chunks without one.
 * Only the heavy chunks get a marker: their recipes end at the nx command, so
 * `NX Successfully ran target <target>` can only mean the chunk's work is
 * done. Multi-step chunks (e.g. pc-db-prep) must NOT get one — an earlier
 * step's success line would mask a hang in a later step.
 */
export function getSuccessMarkerForChunk(chunk: PcChunk): RegExp | undefined {
  if (!HEAVY_PC_CHUNKS.has(chunk)) return undefined;
  const target = chunk === 'pc-lint' ? 'lint' : 'test';
  return new RegExp(`Successfully ran target ${target}`);
}

interface RunPcChunkParams {
  chunk: PcChunk;
  worktreePath?: string;
  verbose?: boolean;
}

export async function runPcChunk(
  params: RunPcChunkParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  const snapshot = await runJobWithBudget(
    {
      command: 'make',
      args: [params.chunk],
      cwd,
      label: params.chunk,
      timeoutMs: getTimeoutForChunk(params.chunk),
      successMarker: getSuccessMarkerForChunk(params.chunk),
      // Blind retries (e.g. after a lost transport) join the in-flight run
      // instead of spawning a duplicate make process.
      idempotencyKey: `pc-chunk:${cwd}:${params.chunk}`,
    },
    SYNC_BUDGET_MS,
  );

  if (snapshot.status === 'running') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            chunk: params.chunk,
            status: 'running',
            jobId: snapshot.jobId,
            elapsedSec: snapshot.elapsedSec,
            logTail: truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS),
            hint: snapshot.hint,
          }),
        },
      ],
    };
  }

  if (snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            chunk: params.chunk,
            status: 'orphaned',
            jobId: snapshot.jobId,
            logTail: truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS),
            hint: snapshot.hint,
          }),
        },
      ],
    };
  }

  const passed = snapshot.status === 'done';
  const log = snapshot.log ?? '';
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          chunk: params.chunk,
          passed,
          ...(snapshot.recoveredFromTimeout
            ? { recoveredFromTimeout: true }
            : {}),
          ...(snapshot.error ? { error: snapshot.error } : {}),
          output: params.verbose
            ? truncateOutput(log, MAX_OUTPUT_CHARS)
            : buildCompactOutput(log, MAX_OUTPUT_CHARS),
        }),
      },
    ],
    ...(passed ? {} : { isError: true }),
  };
}
