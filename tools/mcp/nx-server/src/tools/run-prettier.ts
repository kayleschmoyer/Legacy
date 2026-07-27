import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runPnpm } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// This tool is for surgical fixes to a handful of files, not whole-repo
// formatting — nx_run_pc_chunk({ chunk: 'pc-format' }) already covers that
// path (and carries its own auto-amend/overflow handling, LS-8367/LS-8423).
export const MAX_FILES = 50;

const PRETTIER_TIMEOUT_MS = 60_000;

// Same defence-in-depth shell metacharacter block as nx_run's passthrough
// args (SHELL_METACHAR_REGEX in run-target.ts) — file paths never legitimately
// contain any of these.
const SHELL_METACHAR_REGEX = /[;&`${}]/;

export interface RunPrettierParams {
  files: string[];
  mode?: 'check' | 'write';
  worktreePath?: string;
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export async function runPrettier(
  params: RunPrettierParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const mode = params.mode ?? 'check';

  if (params.files.length > MAX_FILES) {
    return errorResult(
      `Too many files (${params.files.length}) — nx_run_prettier is scoped to surgical fixes, capped at ${MAX_FILES}. ` +
        `For broader formatting use nx_run_pc_chunk({ chunk: "pc-format" }) instead.`,
    );
  }

  for (const file of params.files) {
    if (file.startsWith('-')) {
      return errorResult(
        `Invalid file "${file}": must not start with "-" (would be interpreted as a prettier flag).`,
      );
    }
    if (SHELL_METACHAR_REGEX.test(file)) {
      return errorResult(
        `Invalid file "${file}": contains shell metacharacters (;&\`\${}) which are not allowed.`,
      );
    }
  }

  const flag = mode === 'write' ? '--write' : '--check';

  try {
    const output = await runPnpm(
      ['exec', 'prettier', flag, ...params.files],
      cwd,
      PRETTIER_TIMEOUT_MS,
      undefined,
      true,
    );
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            mode,
            files: params.files.length,
            passed: true,
            output: truncateOutput(output, MAX_OUTPUT_CHARS),
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            mode,
            files: params.files.length,
            passed: false,
            output: truncateOutput(message, MAX_OUTPUT_CHARS),
          }),
        },
      ],
      isError: true,
    };
  }
}
