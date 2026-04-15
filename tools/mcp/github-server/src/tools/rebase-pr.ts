import { execFileSync } from 'node:child_process';
import { getRepoRoot, getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
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

function runGit(args: string[], cwd: string, timeout = 120_000): string {
  try {
    return execFileSync(GIT_CMD, args, {
      cwd,
      encoding: 'utf-8',
      timeout,
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        ...NON_INTERACTIVE_GIT_ENV,
      },
    });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    const parts = [e.message, e.stdout, e.stderr].filter(Boolean);
    throw new Error(parts.join('\n'));
  }
}

/** Get the current branch name, or HEAD SHA if detached. */
function getCurrentRef(cwd: string): string {
  try {
    return runGit(['symbolic-ref', '--short', 'HEAD'], cwd).trim();
  } catch {
    return runGit(['rev-parse', 'HEAD'], cwd).trim();
  }
}

/**
 * Rebase a PR branch onto its base branch (usually main).
 * Fetches origin, rebases, and force-pushes with lease.
 */
export async function rebasePR(params: RebasePRParams): Promise<ToolResult> {
  const { number } = params;
  const cwd = getRepoRoot();
  const log: string[] = [];

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
    log.push(`PR #${number}: ${headRefName} -> ${baseRefName}`);

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
            text: JSON.stringify(
              {
                success: false,
                number,
                branch: headRefName,
                error:
                  'Cross-repo (fork) PRs are not supported — cannot force-push to a fork remote',
                headOwner: headRepository.owner.login,
                baseOwner: baseRepository.owner.login,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Thread 3: Ensure worktree is clean before checkout/rebase
    const status = runGit(['status', '--porcelain'], cwd).trim();
    if (status) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                number,
                error:
                  'Working tree is not clean — commit or stash changes before rebasing',
                dirtyFiles: status,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Thread 2: Capture the original ref so we can restore reliably
    const originalRef = getCurrentRef(cwd);

    try {
      // Fetch the latest refs
      log.push('Fetching origin...');
      runGit(['fetch', 'origin', headRefName, baseRefName], cwd, 30_000);

      // Check out the PR branch (detached to avoid worktree conflicts)
      log.push(`Checking out ${headRefName}...`);
      runGit(['checkout', `origin/${headRefName}`], cwd);

      // Create/update local branch ref
      runGit(['checkout', '-B', headRefName], cwd);

      // Rebase onto base
      log.push(`Rebasing onto origin/${baseRefName}...`);
      try {
        const rebaseOut = runGit(['rebase', `origin/${baseRefName}`], cwd);
        log.push(rebaseOut.trim() || 'Rebase successful');
      } catch (rebaseErr: unknown) {
        const e = rebaseErr as Error;
        const output = e.message || '';

        // Always attempt to abort a failed rebase to avoid leaving repo mid-rebase
        try {
          runGit(['rebase', '--abort'], cwd);
        } catch {
          // ignore abort errors — may not be mid-rebase
        }

        if (output.includes('CONFLICT') || output.includes('could not apply')) {
          // Get structured conflict file list
          let conflictFiles: string[] = [];
          try {
            conflictFiles = runGit(
              ['diff', '--name-only', '--diff-filter=U'],
              cwd,
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
                text: JSON.stringify(
                  {
                    success: false,
                    number,
                    branch: headRefName,
                    error:
                      'Rebase conflicts detected — manual resolution needed',
                    conflictFiles,
                    conflicts: output,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        throw rebaseErr;
      }

      // Force push with lease
      log.push('Pushing rebased branch...');
      runGit(
        [
          'push',
          '--force-with-lease',
          'origin',
          `${headRefName}:${headRefName}`,
        ],
        cwd,
        30_000,
      );
      log.push('Push complete.');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                number,
                branch: headRefName,
                base: baseRefName,
                message: `PR #${number} rebased onto ${baseRefName} and pushed`,
                log: log.join('\n'),
              },
              null,
              2,
            ),
          },
        ],
      };
    } finally {
      // Threads 1 & 2: Always restore to the original ref
      try {
        runGit(['checkout', originalRef], cwd);
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
          text: JSON.stringify(
            {
              success: false,
              number,
              error: `Failed to rebase PR #${number}: ${message}`,
              log: log.join('\n'),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
