import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubRunner {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  labels: Array<{ name: string }>;
}

interface RunnersResponse {
  total_count: number;
  runners: GitHubRunner[];
}

export interface ListRunnersParams {
  status?: 'online' | 'offline';
}

export async function listRunners(
  params: ListRunnersParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    const baseQuery: Record<string, string> = { per_page: '100' };
    if (params.status) baseQuery.status = params.status;

    const allRunners: GitHubRunner[] = [];
    let totalCount = 0;
    let page = 1;

    while (true) {
      const data = await githubRest<RunnersResponse>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/actions/runners`,
        query: { ...baseQuery, page: String(page) },
      });
      totalCount = data.total_count;
      allRunners.push(...data.runners);
      if (allRunners.length >= totalCount || data.runners.length === 0) break;
      page++;
    }

    const runners = allRunners.map((r) => ({
      id: r.id,
      name: r.name,
      os: r.os,
      status: r.status,
      busy: r.busy,
      labels: r.labels.map((l) => l.name),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              totalCount,
              runners,
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
          text: JSON.stringify({
            ok: false,
            error: `Failed to list runners: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
