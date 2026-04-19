import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface ListCommitStatusesParams {
  sha?: string;
  prNumber?: number;
  context?: string;
}

interface CommitStatus {
  id: number;
  state: string;
  context: string;
  description: string | null;
  target_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCommitStatuses(
  params: ListCommitStatusesParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    let sha: string | null = params.sha ?? null;

    if (!sha) {
      if (!params.prNumber) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Provide either "sha" (commit SHA) or "prNumber" (PR number to auto-resolve HEAD SHA).',
            },
          ],
        };
      }
      sha = await resolveHeadShaFromPrNumber(params.prNumber);
      if (!sha) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `PR #${params.prNumber} not found or has no commits.`,
            },
          ],
        };
      }
    }

    // Fetch commit statuses from the Statuses API (paginated)
    // GET /repos/{owner}/{repo}/commits/{sha}/statuses
    const perPage = 100;
    const allStatuses: CommitStatus[] = [];
    let page = 1;
    while (true) {
      const page_statuses = await githubRest<CommitStatus[]>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/commits/${sha}/statuses`,
        query: { per_page: String(perPage), page: String(page) },
      });
      allStatuses.push(...page_statuses);
      if (page_statuses.length < perPage) break;
      page++;
    }

    // Deduplicate by context — keep only the most recent status per context
    // (GitHub returns statuses newest-first, so first occurrence wins)
    const seen = new Set<string>();
    const deduped: CommitStatus[] = [];
    for (const s of allStatuses) {
      if (!seen.has(s.context)) {
        seen.add(s.context);
        deduped.push(s);
      }
    }

    const filtered = params.context
      ? deduped.filter((s) => s.context === params.context)
      : deduped;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sha,
              shortSha: sha.slice(0, 7),
              ...(params.prNumber !== undefined && { pr: params.prNumber }),
              total: filtered.length,
              note: 'These are GitHub commit statuses (Statuses API), not Check Runs (Checks API). github_retrigger_check will NOT find these. To update them, push a new commit or re-run/dispatch the workflow or external system that owns the status. Only use github_set_commit_status to correct a genuinely stale or incorrect status after verifying the underlying result, never to override required checks or branch protection intent.',
              statuses: filtered.map((s) => ({
                context: s.context,
                state: s.state,
                description: s.description,
                targetUrl: s.target_url,
                createdAt: s.created_at,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ref =
      params.sha ?? (params.prNumber ? `PR #${params.prNumber}` : 'unknown');
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list commit statuses for ${ref}: ${message}`,
        },
      ],
    };
  }
}
