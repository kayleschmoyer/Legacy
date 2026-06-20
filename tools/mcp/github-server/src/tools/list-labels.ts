import { markdownTable } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Flat, uniform list → Markdown table (LS-8021). Columns pruned to the fields
// agents consume; `id` and `url` are dropped (labels are addressed by name).
const LABEL_COLUMNS = ['name', 'color', 'description', 'default'] as const;

interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
  default: boolean;
  url: string;
}

interface ListLabelsParams {
  search?: string;
}

export async function listLabels(
  params: ListLabelsParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const perPage = 100;

    const allLabels: GitHubLabel[] = [];
    let page = 1;

    while (true) {
      const results = await githubRest<GitHubLabel[]>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/labels`,
        query: { per_page: String(perPage), page: String(page) },
      });

      allLabels.push(...results);

      if (results.length < perPage) break;
      page++;
    }

    const search = params.search?.toLowerCase();
    const filtered = search
      ? allLabels.filter(
          (l) =>
            l.name.toLowerCase().includes(search) ||
            (l.description ?? '').toLowerCase().includes(search),
        )
      : allLabels;

    const labels = filtered.map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description ?? '',
      default: l.default,
    }));

    const text =
      labels.length === 0
        ? 'No labels found.'
        : `${markdownTable(labels, { columns: LABEL_COLUMNS })}\n\n_total: ${labels.length}_`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list labels: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
