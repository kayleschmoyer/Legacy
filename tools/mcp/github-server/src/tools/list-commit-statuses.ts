import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface ListCommitStatusesParams {
  number: number;
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

    // 1. Resolve head commit SHA from PR number
    const sha = await resolveHeadShaFromPrNumber(params.number);
    if (!sha) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number} not found or has no commits.`,
          },
        ],
      };
    }

    // 2. Fetch commit statuses from the Statuses API (paginated)
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
      if (page_statuses.length < perPage) break; // last page
      page++;
    }
    const statuses = allStatuses;

    // Deduplicate by context — keep only the most recent status per context
    // (GitHub returns statuses newest-first, so first occurrence wins)
    const seen = new Set<string>();
    const deduped: CommitStatus[] = [];
    for (const s of statuses) {
      if (!seen.has(s.context)) {
        seen.add(s.context);
        deduped.push(s);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              pr: params.number,
              sha,
              shortSha: sha.slice(0, 7),
              total: deduped.length,
              note: 'These are GitHub commit statuses (Statuses API), not Check Runs (Checks API). github_retrigger_check will NOT find these. To update them, push a new commit or re-run/dispatch the workflow or external system that owns the status. Only use github_set_commit_status to correct a genuinely stale or incorrect status after verifying the underlying result, never to override required checks or branch protection intent.',
              statuses: deduped.map((s) => ({
                context: s.context,
                state: s.state,
                description: s.description,
                targetUrl: s.target_url,
                updatedAt: s.updated_at,
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
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list commit statuses for PR #${params.number}: ${message}`,
        },
      ],
    };
  }
}
