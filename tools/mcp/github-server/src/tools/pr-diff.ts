import { execFile } from 'node:child_process';
import type { ToolResult } from '../types.js';

interface PrDiffParams {
  prNumber: number;
  maxBytes?: number;
}

const GH_CMD = process.platform === 'win32' ? 'gh.exe' : 'gh';

const DEFAULT_MAX_BYTES = 500_000;
const MAX_BUFFER_BYTES = 20 * 1024 * 1024; // 20 MB hard cap for execFile buffer

export function prDiff(params: PrDiffParams): Promise<ToolResult> {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  return new Promise((resolve) => {
    execFile(
      GH_CMD,
      ['pr', 'diff', String(params.prNumber)],
      { timeout: 30_000, shell: false, maxBuffer: MAX_BUFFER_BYTES },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            isError: true,
            content: [
              {
                type: 'text',
                text: `Failed to get diff for PR #${params.prNumber}: ${stderr || err.message}`,
              },
            ],
          });
          return;
        }

        const diff =
          stdout.length > maxBytes ? stdout.slice(0, maxBytes) : stdout;
        const truncated = stdout.length > maxBytes;

        resolve({
          content: [
            {
              type: 'text',
              text: truncated
                ? `${diff}\n\n[Diff truncated at ${maxBytes} bytes. Use maxBytes to increase the limit.]`
                : diff,
            },
          ],
        });
      },
    );
  });
}
