import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getRepoRoot, runGh, runGhJson } from '../gh.js';
import type { ToolResult } from '../types.js';

interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
}

interface CreatedPR {
  number: number | null;
  url: string;
}

export async function createPR(params: CreatePRParams): Promise<ToolResult> {
  // Write body to a unique temp file to avoid race conditions in concurrent runs
  const suffix = randomBytes(4).toString('hex');
  const tmpPath = join(getRepoRoot(), '.github', `tmp-pr-body-${suffix}.md`);
  writeFileSync(tmpPath, params.body, 'utf8');

  const args = [
    'pr',
    'create',
    '--title',
    params.title,
    '--body-file',
    tmpPath,
    '--base',
    params.base ?? 'main',
  ];

  if (params.draft) {
    args.push('--draft');
  }

  try {
    const output = await runGh(args);

    // Clean up temp file
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }

    // gh pr create outputs the PR URL on success
    const url = output.trim();

    // Fetch the created PR number
    let number: number | null = null;
    try {
      const pr = await runGhJson<{ number: number }>([
        'pr',
        'view',
        '--json',
        'number',
      ]);
      number = pr.number;
    } catch {
      // If we can't get the number, still return success with URL
    }

    const result: CreatedPR = { number, url };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, ...result }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Clean up temp file on error too
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
