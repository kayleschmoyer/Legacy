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

    // Determine PR head branch. Priority: explicit param > upstream tracking ref > local branch name.
    // Upstream is preferred over local when they differ — worktree_push called with remoteBranch
    // sets up tracking to a remote ref that differs from the local branch name, and GitHub 422s
    // if we pass the local name (it doesn't exist as a remote branch). We guard against the
    // "fresh worktree, upstream=origin/main" case by skipping upstream when it equals base.
    const base = params.base ?? 'main';
    let head: string;
    if (params.head) {
      head = params.head;
    } else {
      const currentBranch = await getCurrentBranch(cwd);
      const upstream = await getUpstreamBranch(cwd);

      if (upstream && upstream !== base) {
        head = upstream;
      } else if (currentBranch === 'HEAD') {
        head = upstream ?? currentBranch;
      } else {
        head = currentBranch;
      }
    }
    if (head === base) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Auto-detected head branch "${head}" matches base "${base}". Pass \`head\` explicitly (the branch name to merge from) or pass \`worktreePath\` so the tool can detect the branch from your worktree.`,
          },
        ],
      };
    }

    const pr = await githubRest<GitHubPRResponse>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/pulls`,
      body: {
        title: params.title,
        body: params.body,
        head: `${repo.owner}:${head}`,
        base,
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
