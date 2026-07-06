import { minifiedJson } from '@legacy-sports/mcp-format';
import { runJobWithBudget } from '../jobs.js';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// 30-minute process timeout — a runaway backstop only, NOT a transport guard (that is the
// sync budget + bounded nx_job_wait calls). It must never fire on legitimate work: a cold
// Nx cache (every fresh worktree/cloud session) can push a single chunk past 5 minutes,
// and killing it forces a retry loop that never converges when one task alone exceeds the
// cap (LS-8353).
const PC_CHUNK_TIMEOUT_MS = 30 * 60 * 1000;
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

interface RunPcChunkParams {
  chunk: PcChunk;
  worktreePath?: string;
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
      timeoutMs: PC_CHUNK_TIMEOUT_MS,
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
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          chunk: params.chunk,
          passed,
          ...(snapshot.error ? { error: snapshot.error } : {}),
          output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
        }),
      },
    ],
    ...(passed ? {} : { isError: true }),
  };
}
