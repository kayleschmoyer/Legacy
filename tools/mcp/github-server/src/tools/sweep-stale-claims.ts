import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { ensureSweepLabelsInternal } from './ensure-sweep-labels.js';

interface SweepStaleClaimsParams {
  olderThanMinutes?: number;
}

interface IssueItem {
  number: number;
  title: string;
  pull_request?: unknown;
  html_url: string;
}

interface IssueEvent {
  event: string;
  created_at: string;
  label?: { name: string; color: string };
}

export async function sweepStaleClaims(
  params: SweepStaleClaimsParams,
): Promise<ToolResult> {
  try {
    let labelEnsureWarning: string | undefined;

    // Best-effort: stale-claim scanning is read-only and should not fail
    // just because label creation/update is unavailable.
    try {
      await ensureSweepLabelsInternal();
    } catch (error) {
      labelEnsureWarning = `Warning: failed to ensure sweep labels before scanning: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    const repo = await getRepoOwnerName();
    const thresholdMinutes = params.olderThanMinutes ?? 30;
    const now = Date.now();

    // Fetch all open issues/PRs with sweep-claimed label (paginate through all pages)
    const perPage = 100;
    let page = 1;
    const allIssues: IssueItem[] = [];

    while (true) {
      const pageIssues = await githubRest<IssueItem[]>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/issues`,
        query: {
          labels: 'sweep-claimed',
          state: 'open',
          per_page: String(perPage),
          page: String(page),
        },
      });

      allIssues.push(...pageIssues);

      if (pageIssues.length < perPage) {
        break;
      }

      page += 1;
    }

    // Filter to PRs only (issues endpoint returns both issues and PRs)
    const prs = allIssues.filter((i) => i.pull_request != null);

    if (prs.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              staleClaims: [],
              checkedAt: new Date().toISOString(),
              thresholdMinutes,
              totalClaimed: 0,
              ...(labelEnsureWarning ? { warning: labelEnsureWarning } : {}),
            }),
          },
        ],
      };
    }

    // For each PR, fetch label events to get accurate claim timestamp.
    // Fetch in parallel batches to avoid slow sequential calls.
    const staleClaims: Array<{
      number: number;
      title: string;
      claimedAt: string;
      minutesAgo: number;
    }> = [];

    const batchSize = 10;
    for (let i = 0; i < prs.length; i += batchSize) {
      const batch = prs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (pr) => {
          // Paginate through events until sweep-claimed labeled event is found
          const eventsPerPage = 100;
          let eventsPage = 1;
          let claimEvent: IssueEvent | null = null;

          while (!claimEvent) {
            const pageEvents = await githubRest<IssueEvent[]>({
              method: 'GET',
              path: `/repos/${repo.owner}/${repo.name}/issues/${pr.number}/events`,
              query: {
                per_page: String(eventsPerPage),
                page: String(eventsPage),
              },
            });

            const found = pageEvents
              .filter(
                (e) =>
                  e.event === 'labeled' && e.label?.name === 'sweep-claimed',
              )
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime(),
              )[0];

            if (found) {
              claimEvent = found;
              break;
            }

            if (pageEvents.length < eventsPerPage) {
              break; // exhausted all pages
            }

            eventsPage += 1;
          }

          return { pr, claimEvent };
        }),
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') {
          // Ignore failures for individual PRs so one bad request doesn't fail the entire sweep
          continue;
        }

        const { pr, claimEvent } = result.value;

        if (!claimEvent) {
          // Label exists on PR but no event found — treat as stale (conservative)
          staleClaims.push({
            number: pr.number,
            title: pr.title,
            claimedAt: 'unknown',
            minutesAgo: thresholdMinutes + 1,
          });
          continue;
        }

        const claimedAt = new Date(claimEvent.created_at);
        const minutesAgo = Math.floor((now - claimedAt.getTime()) / 60_000);

        if (minutesAgo >= thresholdMinutes) {
          staleClaims.push({
            number: pr.number,
            title: pr.title,
            claimedAt: claimEvent.created_at,
            minutesAgo,
          });
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              staleClaims,
              checkedAt: new Date().toISOString(),
              thresholdMinutes,
              totalClaimed: prs.length,
              ...(labelEnsureWarning ? { warning: labelEnsureWarning } : {}),
            },
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
          text: `Failed to check stale sweep claims: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
