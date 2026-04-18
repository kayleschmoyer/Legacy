import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { getRepoRoot, getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  head?: string;
  worktreePath?: string;
}

interface GitHubPRResponse {
  number: number;
  html_url: string;
}

function getCurrentBranch(cwd: string): Promise<string> {
  return new Promise((res, reject) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 5_000 },
      (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to get current branch: ${err.message}`));
        } else {
          res(stdout.trim());
        }
      },
    );
  });
}

function getUpstreamBranch(cwd: string): Promise<string | null> {
  return new Promise((res) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      { cwd, timeout: 5_000 },
      (err, stdout) => {
        if (err) {
          res(null);
        } else {
          // stdout is like "origin/claude/LS-1234-foo" — strip the remote prefix
          const parts = stdout.trim().split('/');
          res(parts.length > 1 ? parts.slice(1).join('/') : null);
        }
      },
    );
  });
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

  try {
    const repo = await getRepoOwnerName();

    // Use explicitly provided head, then upstream tracking ref, then local branch name.
    let head: string;
    if (params.head) {
      head = params.head;
    } else {
      const upstream = await getUpstreamBranch(cwd);
      head = upstream ?? (await getCurrentBranch(cwd));
    }

    const pr = await githubRest<GitHubPRResponse>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/pulls`,
      body: {
        title: params.title,
        body: params.body,
        head: `${repo.owner}:${head}`,
        base: params.base ?? 'main',
        draft: params.draft ?? false,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { success: true, number: pr.number, url: pr.html_url },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
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
