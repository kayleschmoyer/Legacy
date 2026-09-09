import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ToolResult } from './types.js';

/**
 * Verify a caller-given file path resolves to a real file under `cwd`
 * (`worktreePath` when supplied, repo root otherwise) before handing it to
 * eslint/prettier. Without this, a missing file (e.g. a new, uncommitted
 * file that exists only in a worktree, when the caller omits `worktreePath`)
 * reaches the underlying tool and surfaces as its generic "No files matching
 * the pattern ... were found" — indistinguishable from a typo'd filename, so
 * the natural next step is re-checking the filename instead of suspecting
 * the tool resolved against the wrong checkout (LS-9853).
 *
 * Returns an error `ToolResult` naming the search root explicitly when the
 * file is missing, or `null` when it exists and the caller should proceed.
 */
export function checkFileExists(
  file: string,
  cwd: string,
  worktreePath: string | undefined,
): ToolResult | null {
  if (existsSync(resolve(cwd, file))) return null;
  return {
    content: [
      {
        type: 'text',
        text: `File "${file}" not found under ${worktreePath ? `worktreePath ${cwd}` : `repo root ${cwd}`}.`,
      },
    ],
    isError: true,
  };
}
