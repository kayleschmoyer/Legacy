import { minifiedJson } from '@legacy-sports/mcp-format';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  getRepoRoot,
  getRepoOwnerName,
  getAuthorToken,
  isLambda,
} from '../auth.js';
import {
  githubRest,
  githubGraphQL,
  type GraphQLResult,
} from '../github-api.js';
import type { ToolResult } from '../types.js';
import {
  ensureJiraLinkMarker,
  extractPrimaryKey,
  isValidPrimary,
  parseRelatedKeys,
} from './jira-link.js';

interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  head?: string;
  worktreePath?: string;
  jiraPrimary?: string;
  jiraRelated?: string | string[];
}

interface GitHubPRResponse {
  number: number;
  html_url: string;
}

interface ReconcilePRResponse {
  repository: {
    pullRequests: {
      nodes: Array<{ number: number; url: string }>;
    };
  };
}

const RECONCILE_QUERY = `
query($owner: String!, $repo: String!, $head: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: 1, states: [OPEN, CLOSED, MERGED], headRefName: $head, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number url }
    }
  }
}`;

async function reconcilePR(
  owner: string,
  name: string,
  head: string,
): Promise<{ number: number; url: string } | null> {
  try {
    const result: GraphQLResult<ReconcilePRResponse> =
      await githubGraphQL<ReconcilePRResponse>(RECONCILE_QUERY, {
        owner,
        repo: name,
        head,
      });
    return result.data.repository.pullRequests.nodes[0] ?? null;
  } catch {
    return null;
  }
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
    // A Windows drive-letter path (e.g. D:\code\...) is absolute on Windows but
    // path.isAbsolute() rejects it on a POSIX server. Detect it explicitly so we
    // accept it as valid. (Note: win32.isAbsolute() can't be used here — it also
    // returns true for POSIX "/foo" paths, which would skip the existence check
    // below for legitimate POSIX paths.)
    const isWindowsDrivePath = /^[A-Za-z]:[/\\]/.test(params.worktreePath);
    if (!isAbsolute(params.worktreePath) && !isWindowsDrivePath) {
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
    // A Windows drive-letter path can only be resolved/checked when this process
    // itself is running on Windows — the path's shape says nothing about the host
    // evaluating it. Gating on shape alone skipped cwd resolution even on a genuine
    // local Windows server, silently falling through to the Lambda-only `head`
    // requirement below for the wrong reason (LS-8837).
    const canResolveOnThisHost =
      !isWindowsDrivePath || process.platform === 'win32';
    // Windows drive-letter paths cannot be accessed from a POSIX server's filesystem.
    // Skip the existsSync check and cwd assignment in that case — the Lambda guard below
    // will require `head` explicitly when git is unavailable on the server.
    if (!lambda && canResolveOnThisHost) {
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

  // Declared ticket linkage (LS-7895): every new PR body carries the
  // structured jira-link marker. Explicit jiraPrimary wins; otherwise the
  // primary is derived from the first LS-#### key in the title; bot/keyless
  // PRs get `primary: none`.
  if (params.jiraPrimary && !isValidPrimary(params.jiraPrimary)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Invalid jiraPrimary "${params.jiraPrimary}" — expected a single LS-#### key or "none".`,
        },
      ],
    };
  }
  let related: string[];
  try {
    related = parseRelatedKeys(params.jiraRelated);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  const primary =
    params.jiraPrimary ?? extractPrimaryKey(params.title) ?? 'none';
  const body = ensureJiraLinkMarker(params.body, { primary, related });

  // Hoisted so the catch block can use head for timeout reconciliation. (LS-8213)
  let head = '';
  try {
    // Resolve the PR-authoring token up front — must be the
    // legacy-sports-code-bot GitHub App token, never a human's personal
    // credential (LS-8333). Thrown errors are caught below and returned as
    // an explicit failure rather than silently falling through to create
    // the PR under whichever token getToken() would otherwise resolve.
    const authorToken = await getAuthorToken();
    const repo = await getRepoOwnerName();

    // Determine PR head branch. Priority: explicit param > upstream tracking ref > local branch name.
    // Upstream is preferred over local when they differ — worktree_push called with remoteBranch
    // sets up tracking to a remote ref that differs from the local branch name, and GitHub 422s
    // if we pass the local name (it doesn't exist as a remote branch). We guard against the
    // "fresh worktree, upstream=origin/main" case by skipping upstream when it equals base.
    const base = params.base ?? 'main';
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
        body,
        head: `${repo.owner}:${head}`,
        base,
        draft: params.draft ?? false,
      },
      token: authorToken,
    });

    // Jira Link Check requires the visible `no-jira` label whenever the
    // marker declares `primary: none` — without it every keyless PR is born
    // with a guaranteed-failing check (LS-8298). Best-effort: a label failure
    // must not fail PR creation; it is surfaced via noJiraLabelApplied.
    let noJiraLabelApplied: boolean | undefined;
    if (primary === 'none') {
      try {
        await githubRest({
          method: 'POST',
          path: `/repos/${repo.owner}/${repo.name}/issues/${pr.number}/labels`,
          body: { labels: ['no-jira'] },
        });
        noJiraLabelApplied = true;
      } catch {
        noJiraLabelApplied = false;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            number: pr.number,
            url: pr.html_url,
            ...(noJiraLabelApplied === undefined ? {} : { noJiraLabelApplied }),
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // On timeout the PR may have been created server-side. Attempt a reconciliation
    // lookup by head branch before reporting failure. (LS-8213)
    if (/timed? ?out/i.test(message) && head) {
      const repo = await getRepoOwnerName().catch(() => null);
      if (repo) {
        const found = await reconcilePR(repo.owner, repo.name, head);
        if (found) {
          return {
            content: [
              {
                type: 'text',
                text: minifiedJson({
                  success: true,
                  number: found.number,
                  url: found.url,
                  note: 'Request timed out but PR was created server-side; reconciled via branch lookup.',
                }),
              },
            ],
          };
        }
      }
    }
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to create PR: ${message}`,
        },
      ],
    };
  }
}
