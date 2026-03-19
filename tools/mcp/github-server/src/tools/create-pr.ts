import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { getRepoRoot, runGh, runGhJson } from '../gh.js';
import type { ToolResult } from '../types.js';

interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  worktreePath?: string;
}

interface CreatedPR {
  number: number | null;
  url: string;
}

export async function createPR(params: CreatePRParams): Promise<ToolResult> {
  // Validate and resolve worktreePath
  let cwd = getRepoRoot();
  if (params.worktreePath) {
    const resolved = resolve(params.worktreePath);
    if (!isAbsolute(resolved)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `worktreePath must be an absolute path, got: "${params.worktreePath}"`,
          },
        ],
      };
    }
    if (!existsSync(resolved)) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `worktreePath does not exist: "${resolved}"` },
        ],
      };
    }
    cwd = resolved;
  }

  // Write body to OS temp dir to avoid gitignore issues and untracked file noise
  const suffix = randomBytes(4).toString('hex');
  const tmpPath = join(tmpdir(), `tmp-pr-body-${suffix}.md`);
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
    const output = await runGh(args, cwd);

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
      const pr = await runGhJson<{ number: number }>(
        ['pr', 'view', '--json', 'number'],
        cwd,
      );
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
