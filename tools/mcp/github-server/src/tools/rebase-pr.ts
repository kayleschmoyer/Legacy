import { minifiedJson } from '@legacy-sports/mcp-format';
import { execFile } from 'node:child_process';
import { getRepoRoot, getRepoOwnerName, isLambda } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import { runWithSyncBudget, withCheckoutLock } from '../jobs.js';
import type { JobLogger } from '../jobs.js';
import type { ToolResult } from '../types.js';

interface RebasePRParams {
  number: number;
}

interface PRInfo {
  headRefName: string;
  baseRefName: string;
  headRepository: { owner: { login: string }; name: string };
  baseRepository: { owner: { login: string }; name: string };
}

interface PRGraphQLResponse {
  repository: {
    pullRequest: PRInfo;
  };
}

const PR_QUERY = `
  query ($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        headRefName
        baseRefName
        headRepository {
          owner { login }
          name
        }
        baseRepository {
          owner { login }
          name
        }
      }
    }
  }
`;

const GIT_CMD = process.platform === 'win32' ? 'git.exe' : 'git';
const MAX_BUFFER = 10 * 1024 * 1024;
const NOOP_GIT_EDITOR_CMD = 'node -e "process.exit(0)"';
const NON_INTERACTIVE_GIT_ENV = {
  GIT_EDITOR: NOOP_GIT_EDITOR_CMD,
  GIT_SEQUENCE_EDITOR: NOOP_GIT_EDITOR_CMD,
};

// Async (not execFileSync): rebase runs as an in-process background job, and a
// sync exec would block the server's event loop — github_job_wait could never
// answer while a rebase was in flight.
function runGit(
  args: string[],
  cwd: string,
  timeout = 120_000,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      GIT_CMD,
      args,
      {
        cwd,
        encoding: 'utf-8',
        timeout,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          ...NON_INTERACTIVE_GIT_ENV,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          const parts = [err.message, stdout, stderr].filter(Boolean);
          rejectPromise(new Error(parts.join('\n')));
        } else {
          resolvePromise(stdout);
        }
      },
    );
  });
}

/** Get the current branch name, or HEAD SHA if detached. */
async function getCurrentRef(cwd: string): Promise<string> {
  try {
    return (await runGit(['symbolic-ref', '--short', 'HEAD'], cwd)).trim();
  } catch {
    return (await runGit(['rev-parse', 'HEAD'], cwd)).trim();
  }
}

/**
 * Rebase a PR branch onto its base branch (usually main).
 * Fetches origin, rebases, and force-pushes with lease.
 *
 * Stdio deployments run this under a bounded sync budget: fast rebases return
 * their result inline; slow ones return { jobId, status: "running" } to poll
 * with github_job_wait. The Lambda deployment has no `git` binary on its PATH
 * (LS-7753), so it takes a different path entirely — a GitHub API merge-style
 * branch update — rather than the git-subprocess worker used everywhere else.
 */
export async function rebasePR(params: RebasePRParams): Promise<ToolResult> {
  if (isLambda()) return rebasePRViaApi(params);
  return runWithSyncBudget(`rebase-pr #${params.number}`, (log) =>
    withCheckoutLock(() => rebasePRWorker(params, log)),
  );
}

/**
 * Lambda-only rebase path: no `git` binary is available there (spawning one
 * fails with `spawnSync git ENOENT`, LS-7753), so instead of a real rebase
 * this updates the PR branch via GitHub's REST "update pull request branch"
 * endpoint, which merges the base branch into the head branch server-side.
 * Note this produces a merge commit, not a linear rebase — an accepted
 * trade-off for the Lambda deployment per the ticket's proposed fix.
 */
export async function rebasePRViaApi(
  params: RebasePRParams,
): Promise<ToolResult> {
  const { number } = params;

  try {
    const repo = await getRepoOwnerName();
    const { data } = await githubGraphQL<PRGraphQLResponse>(PR_QUERY, {
      owner: repo.owner,
      name: repo.name,
      number,
    });
    const pr = data.repository.pullRequest;
    const { headRefName, baseRefName, headRepository, baseRepository } = pr;

    // Detect cross-repo (fork) PRs — the update-branch endpoint operates on
    // the PR's own head branch, but we still can't meaningfully "rebase" a
    // fork PR onto a differently-owned base the way this tool is used.
    if (
      headRepository.owner.login !== baseRepository.owner.login ||
      headRepository.name !== baseRepository.name
    ) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: false,
              number,
              branch: headRefName,
              error:
                'Cross-repo (fork) PRs are not supported — cannot force-push to a fork remote',
              headOwner: headRepository.owner.login,
              baseOwner: baseRepository.owner.login,
            }),
          },
        ],
      };
    }

    await githubRest({
      method: 'PUT',
      path: `/repos/${repo.owner}/${repo.name}/pulls/${number}/update-branch`,
    });

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            number,
            branch: headRefName,
            base: baseRefName,
            message:
              `PR #${number} updated with latest ${baseRefName} via GitHub API ` +
              'merge-style update (Lambda has no git binary, LS-7753) — this ' +
              'creates a merge commit rather than a linear rebase',
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Match the HTTP status githubRest embeds as "failed (NNN):" — a bare
    // \b422\b would also match a PR numbered 422 in the request path.
    const isConflict =
      /failed \((422|409)\)/.test(message) ||
      /conflict|diverged/i.test(message);

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            number,
            error: isConflict
              ? `Rebase conflicts detected — manual resolution needed (via GitHub API update-branch): ${message}`
              : `Failed to rebase PR #${number}: ${message}`,
          }),
        },
      ],
    };
  }
}

/**
 * The actual rebase sequence. Exported for bulk-rebase, which runs many PRs
 * inside a single job — callers other than rebasePR must hold the checkout
 * lock themselves (withCheckoutLock) since this mutates the shared checkout.
 */
export async function rebasePRWorker(
  params: RebasePRParams,
  jobLog: JobLogger = () => {},
): Promise<ToolResult> {
  const { number } = params;
  const cwd = getRepoRoot();
  const log: string[] = [];
  const note = (line: string) => {
    log.push(line);
    jobLog(line);
  };

  try {
    // Get PR branch info including repo owners for fork detection
    const repo = await getRepoOwnerName();
    const { data } = await githubGraphQL<PRGraphQLResponse>(PR_QUERY, {
      owner: repo.owner,
      name: repo.name,
      number,
    });
    const pr = data.repository.pullRequest;

    const { headRefName, baseRefName, headRepository, baseRepository } = pr;
    note(`PR #${number}: ${headRefName} -> ${baseRefName}`);

    // Detect cross-repo (fork) PRs — we can only push to same-repo branches
    if (
      headRepository.owner.login !== baseRepository.owner.login ||
      headRepository.name !== baseRepository.name
    ) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: false,
              number,
              branch: headRefName,
              error:
                'Cross-repo (fork) PRs are not supported — cannot force-push to a fork remote',
              headOwner: headRepository.owner.login,
              baseOwner: baseRepository.owner.login,
            }),
          },
        ],
      };
    }

    // Thread 3: Ensure worktree is clean before checkout/rebase.
    // Filter out untracked agent runtime files (.claude/) and lock files —
    // they have no bearing on the rebase and must not block it.
    const statusOutput = (await runGit(['status', '--porcelain'], cwd)).trim();
    const dirtyLines = statusOutput
      ? statusOutput.split('\n').filter((line) => {
          if (!line.startsWith('?? ')) return true; // tracked change — always dirty
          const filePath = line.slice(3);
          if (filePath.startsWith('.claude/')) return false;
          if (filePath.endsWith('.lock')) return false;
          return true;
        })
      : [];
    const status = dirtyLines.join('\n');
    if (status) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: false,
              number,
              error:
                'Working tree is not clean — commit or stash changes before rebasing',
              dirtyFiles: status,
            }),
          },
        ],
      };
    }

    // Thread 2: Capture the original ref so we can restore reliably
    const originalRef = await getCurrentRef(cwd);

    try {
      // Fetch the latest refs
      note('Fetching origin...');
      await runGit(['fetch', 'origin', headRefName, baseRefName], cwd, 30_000);

      // Check out the PR branch (detached to avoid worktree conflicts)
      note(`Checking out ${headRefName}...`);
      await runGit(['checkout', `origin/${headRefName}`], cwd);

      // Create/update local branch ref
      await runGit(['checkout', '-B', headRefName], cwd);

      // Rebase onto base
      note(`Rebasing onto origin/${baseRefName}...`);
      try {
        const rebaseOut = await runGit(
          ['rebase', `origin/${baseRefName}`],
          cwd,
        );
        note(rebaseOut.trim() || 'Rebase successful');
      } catch (rebaseErr: unknown) {
        const e = rebaseErr as Error;
        const output = e.message || '';

        // Always attempt to abort a failed rebase to avoid leaving repo mid-rebase
        try {
          await runGit(['rebase', '--abort'], cwd);
        } catch {
          // ignore abort errors — may not be mid-rebase
        }

        if (output.includes('CONFLICT') || output.includes('could not apply')) {
          // Get structured conflict file list
          let conflictFiles: string[] = [];
          try {
            conflictFiles = (
              await runGit(['diff', '--name-only', '--diff-filter=U'], cwd)
            )
              .trim()
              .split('\n')
              .filter(Boolean);
          } catch {
            // ignore — we already aborted
          }

          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: minifiedJson({
                  success: false,
                  number,
                  branch: headRefName,
                  error: 'Rebase conflicts detected — manual resolution needed',
                  conflictFiles,
                  conflicts: output,
                }),
              },
            ],
          };
        }

        throw rebaseErr;
      }

      // Force push with lease
      note('Pushing rebased branch...');
      await runGit(
        [
          'push',
          '--force-with-lease',
          'origin',
          `${headRefName}:${headRefName}`,
        ],
        cwd,
        30_000,
      );
      note('Push complete.');

      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: true,
              number,
              branch: headRefName,
              base: baseRefName,
              message: `PR #${number} rebased onto ${baseRefName} and pushed`,
              log: log.join('\n'),
            }),
          },
        ],
      };
    } finally {
      // Threads 1 & 2: Always restore to the original ref
      try {
        await runGit(['checkout', originalRef], cwd);
      } catch {
        // Best effort — log but don't mask the original error
      }
    }
  } catch (error) {
    // runGit already wraps stdout/stderr into the Error message
    const message = error instanceof Error ? error.message : String(error);

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            number,
            error: `Failed to rebase PR #${number}: ${message}`,
            log: log.join('\n'),
          }),
        },
      ],
    };
  }
}
