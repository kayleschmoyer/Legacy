import { markdownTable } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

// Flat, uniform list → Markdown table (LS-8021).
const STATUS_COLUMNS = [
  'context',
  'state',
  'description',
  'targetUrl',
  'createdAt',
] as const;

// Guidance preserved verbatim from the prior JSON `note` field: commit statuses
// (Statuses API) are not Check Runs, so github_retrigger_check won't find them.
const STATUS_NOTE =
  "These are GitHub commit statuses (Statuses API), not Check Runs (Checks API). github_retrigger_check will NOT find these. To update them, push a new commit or re-run/dispatch the workflow or external system that owns the status. github_set_commit_status exists to correct a genuinely stale or incorrect status after verifying the underlying result, never to override required checks or branch protection intent — but expect that call to require explicit human confirmation even for this exact case (rewriting a commit status changes a PR's visible merge-readiness signal), so it will not always go through unattended. If it is denied, surface the verified evidence (the log/check output that shows the status is stale) to the user instead of retrying the call.";

// Surfaced when the Statuses API 403s and this tool falls back to the
// statusCheckRollup-derived view instead (LS-5234). The fallback only works
// when a `prNumber` is available to resolve the rollup from — callers on a
// bare `sha` still get the raw 403 with its permission-grant hint.
const FALLBACK_NOTE =
  'The GitHub App installation lacks the "Commit statuses: Read" permission, so this fell back to deriving statuses from `statusCheckRollup` (the same data `github_view_pr` returns). Results may omit statuses beyond the first 100 rollup contexts. Ask an admin to grant the App "Commit statuses: Read" to restore the direct Statuses API path.';

/** Matches the permission-scope 403 thrown by `githubRest` for a missing GitHub App permission (see `PATH_PERMISSION_TABLE` in `github-api.ts`). */
function isPermissionScopeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /resource not accessible by integration/i.test(error.message)
  );
}

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

/** Fetch every commit status page from the Statuses API and dedupe to the latest per context. */
async function fetchAllCommitStatuses(
  repo: { owner: string; name: string },
  sha: string,
): Promise<CommitStatus[]> {
  // GET /repos/{owner}/{repo}/commits/{sha}/statuses (paginated)
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
  return deduped;
}

interface StatusRollupContext {
  __typename: 'StatusContext';
  context: string;
  state: string;
  description: string | null;
  targetUrl: string | null;
  createdAt: string;
}

interface StatusRollupResponse {
  repository: {
    pullRequest: null | {
      commits: {
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: {
                // Checks API entries (CheckRun) show up in the same rollup as
                // commit statuses (StatusContext) — the inline fragment below
                // only requests StatusContext fields, so CheckRun nodes come
                // back as `{}` and are filtered out by the `context` check.
                nodes: Array<Partial<StatusRollupContext>>;
              };
            } | null;
          };
        }>;
      };
    };
  };
}

const STATUS_ROLLUP_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  ... on StatusContext {
                    __typename
                    context
                    state
                    description
                    targetUrl
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Degraded-mode fallback for when the Statuses API 403s for lack of the
 * "Commit statuses: Read" App permission: derive the same context/state pairs
 * from `statusCheckRollup`, the field `github_view_pr` already reads
 * successfully with the same token (LS-5234).
 */
async function fetchStatusContextsViaRollup(
  repo: { owner: string; name: string },
  prNumber: number,
): Promise<CommitStatus[]> {
  const result = await githubGraphQL<StatusRollupResponse>(
    STATUS_ROLLUP_QUERY,
    { owner: repo.owner, repo: repo.name, number: prNumber },
  );
  const nodes =
    result.data.repository.pullRequest?.commits.nodes[0]?.commit
      .statusCheckRollup?.contexts.nodes ?? [];

  return nodes
    .filter((n): n is StatusRollupContext => n.__typename === 'StatusContext')
    .map((n) => ({
      id: 0,
      state: n.state.toLowerCase(),
      context: n.context,
      description: n.description,
      target_url: n.targetUrl,
      created_at: n.createdAt,
      updated_at: n.createdAt,
    }));
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

    let deduped: CommitStatus[];
    let usedFallback = false;
    try {
      deduped = await fetchAllCommitStatuses(repo, sha);
    } catch (error) {
      // GitHub App installation lacks "Commit statuses: Read" — degrade to the
      // statusCheckRollup GraphQL data instead of surfacing a raw 403
      // (LS-5234). Only possible when we have a PR number to query the
      // rollup by; a bare-sha caller still gets the original error.
      if (isPermissionScopeError(error) && params.prNumber !== undefined) {
        deduped = await fetchStatusContextsViaRollup(repo, params.prNumber);
        usedFallback = true;
      } else {
        throw error;
      }
    }

    const filtered = params.context
      ? deduped.filter((s) => s.context === params.context)
      : deduped;

    const statuses = filtered.map((s) => ({
      context: s.context,
      state: s.state,
      description: s.description ?? '',
      targetUrl: s.target_url ?? '',
      createdAt: s.created_at,
    }));

    const note = usedFallback
      ? `${STATUS_NOTE}\n>\n> ${FALLBACK_NOTE}`
      : STATUS_NOTE;
    const header = `_sha: ${sha.slice(0, 7)}${params.prNumber !== undefined ? `, PR #${params.prNumber}` : ''}, total: ${statuses.length}_\n\n> ${note}`;
    const text =
      statuses.length === 0
        ? `No commit statuses found for ${sha.slice(0, 7)}.\n\n> ${note}`
        : `${header}\n\n${markdownTable(statuses, { columns: STATUS_COLUMNS })}`;

    return {
      content: [{ type: 'text', text }],
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
