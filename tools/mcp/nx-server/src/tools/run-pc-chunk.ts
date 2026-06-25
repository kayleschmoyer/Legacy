import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runCommand } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// 5-minute timeout — each pc-chunk can take longer than the Bash tool's ~120s limit.
const PC_CHUNK_TIMEOUT_MS = 5 * 60 * 1000;

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

  try {
    const output = await runCommand(
      'make',
      [params.chunk],
      cwd,
      PC_CHUNK_TIMEOUT_MS,
      undefined,
      true,
    );

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            chunk: params.chunk,
            passed: true,
            output: truncateOutput(output, MAX_OUTPUT_CHARS),
          }),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: truncateOutput(
            `${params.chunk} FAILED: ${error instanceof Error ? error.message : String(error)}`,
            MAX_OUTPUT_CHARS,
          ),
        },
      ],
      isError: true,
    };
  }
}
