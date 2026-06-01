import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { getRepoRoot, getRepoOwnerName, isLambda } from '../auth.js';
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
  // Validate and resolve worktreePath.
  // In Lambda the server runs on a different host than the caller, so the
  // worktreePath is a client-side path that does NOT exist on Lambda's
  // filesystem — skip the existence check and ignore the path for `cwd`
  // (we cannot run git in the worktree anyway; no git binary). The caller
  // must pass `head` explicitly in Lambda mode. (LS-4881)
  const lambda = isLambda();
  let cwd = getRepoRoot();
  // Only use worktreePath for branch auto-detection when head is not explicitly provided.
  // worktreePath is meaningless in Lambda (no client filesystem access), and Windows paths
  // fail Unix isAbsolute() checks even when head is already known. (LS-5217)
  if (params.worktreePath && !params.head) {
    if (!isAbsolute(params.worktreePath)) {
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
    if (!lambda) {
      const resolved = resolve(params.worktreePath);
      if (!existsSync(resolved)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `worktreePath does not exist: "${resolved}"`,
            },
          ],
        };
      }
      cwd = resolved;
    }
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
    } else if (lambda) {
      // Lambda has no git binary, so auto-detection from the worktree is
      // impossible. Require the caller to pass `head` explicitly. (LS-4881)
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              'In the URL-based (Lambda) GitHub MCP server, `head` must be passed explicitly — ' +
              'git is not available on the server to auto-detect the branch from `worktreePath`. ' +
              'Pass `head` set to the local branch name (e.g. `claude/<random-name>`).',
          },
        ],
      };
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
            text: `Auto-detected head branch "${head}" matches base "${base}". Pass \`head\` explicitly with the branch name to merge from (e.g. "claude/<name>").`,
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
