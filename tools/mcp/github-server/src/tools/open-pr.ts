import { minifiedJson } from '@legacy-sports/mcp-format';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  ensureJiraLinkMarker,
  ensureTitleHasPrimaryKey,
  extractPrimaryKey,
  isValidPrimary,
} from './jira-link.js';
import {
  getAuthorToken,
  getRepoOwnerName,
  getRepoRoot,
  isLambda,
} from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import { runWithSyncBudget } from '../jobs.js';
import type { JobLogger } from '../jobs.js';
import type { ToolResult } from '../types.js';

export interface OpenPRParams {
  title: string;
  /** PR body markdown. Mutually exclusive with bodyFile. */
  body?: string;
  /**
   * Path (absolute, or relative to worktreePath/repo root) to a file whose
   * contents become the PR body verbatim. Mutually exclusive with body.
   * Not supported in Lambda mode — the server has no local filesystem.
   */
  bodyFile?: string;
  base?: string;
  /** Leave PR in draft state — skips mark-ready and bot:ready-for-review label. */
  draft?: boolean;
  /** Explicit remote branch name. Required in Lambda mode; auto-detected otherwise. */
  head?: string;
  /** Absolute path to the local worktree. Used for git branch auto-detection and push. */
  worktreePath?: string;
  /** LS-#### key; inserted as jira-link marker in PR body and returned in result. */
  jiraKey?: string;
  /** Push the branch before creating the PR (default: true). Pass false if already pushed. */
  push?: boolean;
}

interface GitHubPRResponse {
  number: number;
  html_url: string;
}

interface PRNodeIdResponse {
  repository: { pullRequest: { id: string; isDraft: boolean } | null };
}

interface MarkReadyResponse {
  markPullRequestReadyForReview: {
    pullRequest: { number: number; isDraft: boolean; url: string };
  };
}

const MARK_READY_MUTATION = `
mutation($prId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
    pullRequest { number isDraft url }
  }
}`;

const GET_PR_NODE_ID = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { id isDraft }
  }
}`;

function runGitPush(cwd: string, remote = 'origin'): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['push', '-u', remote, 'HEAD', '--force-with-lease'],
      { cwd, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || err.message));
        } else {
          resolve((stdout + stderr).trim());
        }
      },
    );
  });
}

function getCurrentBranch(cwd: string): Promise<string> {
  return new Promise((res, reject) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 5_000 },
      (err, stdout) => {
        if (err) reject(new Error(`Failed to get branch: ${err.message}`));
        else res(stdout.trim());
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
        if (err) res(null);
        else {
          const parts = stdout.trim().split('/');
          res(parts.length > 1 ? parts.slice(1).join('/') : null);
        }
      },
    );
  });
}

/**
 * Semantic one-shot for Step 12 of the ticket spine (Ship):
 * push branch → create PR as draft → mark ready for review → apply bot:ready-for-review label.
 *
 * Replaces the six-step worktree_push → create-draft-PR → github_mark_pr_ready →
 * github_manage_labels(add: bot:ready-for-review) → github_request_review sequence.
 * The bot:ready-for-review label is always applied (required for fix-push cycles to
 * re-trigger the Reviewer Bot). Pass draft: true to skip mark-ready and the label.
 *
 * Stdio deployments run this under a bounded sync budget because the git-push
 * phase can exceed the ~60s MCP transport timeout: fast runs return the final
 * result inline; slow ones return { jobId, status: "running" } to poll with
 * github_job_wait. The Lambda deployment (push always skipped) keeps the
 * direct path.
 */
export async function openPR(params: OpenPRParams): Promise<ToolResult> {
  if (isLambda()) return openPRWorker(params);
  return runWithSyncBudget(`open-pr ${params.head ?? params.title}`, (log) =>
    openPRWorker(params, log),
  );
}

async function openPRWorker(
  params: OpenPRParams,
  jobLog: JobLogger = () => undefined,
): Promise<ToolResult> {
  const lambda = isLambda();
  const shouldPush = params.push !== false;

  // Resolve cwd for git operations
  const repoRoot = getRepoRoot();
  let cwd = repoRoot;
  const isWindowsDrivePath = (p: string) => /^[A-Za-z]:[/\\]/.test(p);
  // A Windows drive-letter worktreePath can only be resolved/checked when this
  // process itself is running on Windows — the string SHAPE of the path says
  // nothing about the HOST it's being evaluated on. Gating on the shape alone
  // (as opposed to `process.platform`) meant a genuinely local, non-Lambda
  // Windows session with a real `D:\...` worktreePath fell through this block
  // without ever setting `cwd`, then hit the "Lambda mode" branch below purely
  // because `params.head` was omitted — misreporting Lambda mode when the
  // actual cause was an un-resolved worktreePath (LS-8837).
  const canResolveOnThisHost =
    !isWindowsDrivePath(params.worktreePath ?? '') ||
    process.platform === 'win32';

  if (params.worktreePath) {
    if (
      !isAbsolute(params.worktreePath) &&
      !isWindowsDrivePath(params.worktreePath)
    ) {
      return err(
        `worktreePath must be an absolute path, got: "${params.worktreePath}"`,
      );
    }
    // Windows drive-letter paths can't be checked from a POSIX server (Lambda or CI).
    if (!lambda && canResolveOnThisHost) {
      const resolved = resolve(params.worktreePath);
      if (!existsSync(resolved)) {
        return err(`worktreePath does not exist: "${resolved}"`);
      }
      // Containment check: worktreePath must be the repo root or a subdirectory of it.
      const rel = relative(repoRoot, resolved);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return err(
          `worktreePath "${resolved}" is outside the repository root "${repoRoot}". Only paths within the repository are allowed.`,
        );
      }
      cwd = resolved;
    }
  }

  // Validate jiraKey
  if (params.jiraKey && !isValidPrimary(params.jiraKey)) {
    return err(
      `Invalid jiraKey "${params.jiraKey}" — expected LS-#### format.`,
    );
  }

  // Resolve body vs bodyFile — mutually exclusive.
  if (params.body !== undefined && params.bodyFile !== undefined) {
    return err('Provide either `body` or `bodyFile`, not both.');
  }
  if (params.body === undefined && params.bodyFile === undefined) {
    return err('Provide either `body` or `bodyFile`.');
  }
  let body: string;
  if (params.bodyFile !== undefined) {
    if (lambda) {
      return err(
        `bodyFile is not supported in Lambda mode — the server has no local filesystem and cannot read "${params.bodyFile}"; that path only exists on the caller's filesystem, not the Lambda server's. Pass \`body\` with the content inline instead.`,
      );
    }
    const resolvedBodyFile = isAbsolute(params.bodyFile)
      ? params.bodyFile
      : resolve(cwd, params.bodyFile);
    // Containment check: bodyFile becomes the publicly-visible PR body, so it
    // must live inside the repo — never an arbitrary path like ~/.ssh/id_rsa
    // or ~/.aws/credentials (LS-9581 review finding).
    const bodyFileRel = relative(repoRoot, resolvedBodyFile);
    if (bodyFileRel.startsWith('..') || isAbsolute(bodyFileRel)) {
      return err(
        `bodyFile "${resolvedBodyFile}" is outside the repository root "${repoRoot}". Refusing to read it — its contents would become the PR body, which is publicly visible. Only paths within the repository are allowed.`,
      );
    }
    try {
      body = readFileSync(resolvedBodyFile, 'utf-8');
    } catch (e) {
      return err(
        `Cannot read bodyFile "${resolvedBodyFile}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    body = params.body as string;
  }

  // Resolve the PR-authoring token up front — must be the
  // legacy-sports-code-bot GitHub App token, never a human's personal
  // credential (LS-8333). Resolved before the push below so a session
  // without bot credentials fails loudly instead of leaving a pushed branch
  // with no PR behind it.
  let authorToken: string;
  try {
    authorToken = await getAuthorToken();
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  // Push branch
  let pushOutput: string | undefined;
  if (shouldPush && !lambda) {
    try {
      jobLog('Pushing branch (force-with-lease)...');
      pushOutput = await runGitPush(cwd);
      jobLog('Push complete.');
    } catch (e) {
      return err(
        `git push failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Resolve head branch
  const base = params.base ?? 'main';
  let head: string;
  if (params.head) {
    head = params.head;
  } else if (lambda) {
    // Explicitly acknowledge a passed worktreePath instead of silently ignoring
    // it — a bare "head must be passed explicitly" reads as if the tool never
    // saw worktreePath at all, when the real reason is that the Lambda server
    // runs on a different host than the caller and can never read it (LS-8837).
    return err(
      params.worktreePath
        ? `In Lambda mode, \`head\` must be passed explicitly — the server cannot read worktreePath "${params.worktreePath}"; that path only exists on the caller's filesystem, not the Lambda server's. Pass \`head\` set to the local branch name (e.g. \`claude/<branch-name>\`).`
        : 'In Lambda mode, `head` must be passed explicitly — git is not available to auto-detect the branch.',
    );
  } else {
    const currentBranch = await getCurrentBranch(cwd);
    const upstream = await getUpstreamBranch(cwd);
    if (upstream && upstream !== base) {
      head = upstream;
    } else {
      head = currentBranch;
    }
  }

  if (head === base) {
    return err(
      `Auto-detected head branch "${head}" matches base "${base}". Pass \`head\` explicitly with the feature branch name.`,
    );
  }

  // Build PR title + body with the jira-link marker. The CI Jira Link Check
  // requires the primary key to appear in the title itself (LS-8679) — the
  // marker alone (body-only) isn't sufficient.
  const primary = params.jiraKey ?? extractPrimaryKey(params.title) ?? 'none';
  const title = ensureTitleHasPrimaryKey(params.title, primary);
  const prBody = ensureJiraLinkMarker(body, { primary, related: [] });

  try {
    const repo = await getRepoOwnerName();

    // Step 1: Create PR (always as draft initially, per Author Agent Contract)
    jobLog('Creating PR...');
    const pr = await githubRest<GitHubPRResponse>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/pulls`,
      body: {
        title,
        body: prBody,
        head: `${repo.owner}:${head}`,
        base,
        draft: true,
      },
      token: authorToken,
    });

    const prNumber = pr.number;
    const prUrl = pr.html_url;
    const warnings: string[] = [];

    // Jira Link Check requires the visible `no-jira` label whenever the marker
    // declares `primary: none` — `primary` falls back to 'none' above when no
    // jiraKey was passed and the title carries no key, so without this the
    // tool can mint a PR with a guaranteed-failing check entirely on its own
    // (LS-9043). `create_pr` has done this since LS-8298; `open_pr` never did.
    // Must precede the `bot:ready-for-review` apply below, which has to stay
    // the last label op — the Reviewer Bot runs cancel-in-progress, so a later
    // label queues a run that kills the review before it can post.
    let noJiraLabelApplied: boolean | undefined;
    if (primary === 'none') {
      try {
        await githubRest({
          method: 'POST',
          path: `/repos/${repo.owner}/${repo.name}/issues/${prNumber}/labels`,
          body: { labels: ['no-jira'] },
        });
        noJiraLabelApplied = true;
      } catch (e) {
        noJiraLabelApplied = false;
        warnings.push(
          `no-jira label apply failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // If draft requested, stop here
    if (params.draft) {
      return ok({
        prNumber,
        url: prUrl,
        head,
        jiraKey: primary !== 'none' ? primary : undefined,
        draft: true,
        warnings,
        ...(noJiraLabelApplied === undefined ? {} : { noJiraLabelApplied }),
        ...(pushOutput !== undefined ? { pushed: true } : {}),
      });
    }

    // Step 2: Mark PR ready for review
    let markedReady = false;
    let readyLabelApplied = false;

    try {
      const nodeRes = await githubGraphQL<PRNodeIdResponse>(GET_PR_NODE_ID, {
        owner: repo.owner,
        repo: repo.name,
        number: prNumber,
      });
      const prNode = nodeRes.data.repository.pullRequest;
      if (prNode && prNode.isDraft) {
        await githubGraphQL<MarkReadyResponse>(MARK_READY_MUTATION, {
          prId: prNode.id,
        });
        markedReady = true;
      } else {
        markedReady = true; // already ready (shouldn't happen for freshly created draft)
      }
    } catch (e) {
      warnings.push(
        `mark-ready failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Step 3: Apply bot:ready-for-review label
    try {
      await githubRest({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/issues/${prNumber}/labels`,
        body: { labels: ['bot:ready-for-review'] },
      });
      readyLabelApplied = true;
    } catch (e) {
      warnings.push(
        `label apply failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return ok({
      prNumber,
      url: prUrl,
      head,
      jiraKey: primary !== 'none' ? primary : undefined,
      draft: false,
      markedReady,
      readyLabelApplied,
      warnings,
      ...(noJiraLabelApplied === undefined ? {} : { noJiraLabelApplied }),
      ...(pushOutput !== undefined ? { pushed: true } : {}),
    });
  } catch (e) {
    return err(
      `Failed to create PR: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function ok(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: minifiedJson(payload) }] };
}

function err(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
