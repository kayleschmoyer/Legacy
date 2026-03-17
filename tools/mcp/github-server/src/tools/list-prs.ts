import { runGhJson } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ListPRsParams {
  state?: string;
  branch?: string;
  author?: string;
  label?: string;
  search?: string;
  limit?: number;
}

interface PRSummary {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
  isDraft: boolean;
  mergedAt: string | null;
  reviewDecision: string | null;
}

const PR_FIELDS = [
  'number',
  'title',
  'state',
  'headRefName',
  'baseRefName',
  'author',
  'createdAt',
  'updatedAt',
  'url',
  'labels',
  'isDraft',
  'mergedAt',
  'reviewDecision',
];

export async function listPRs(params: ListPRsParams): Promise<ToolResult> {
  const args = [
    'pr',
    'list',
    '--json',
    PR_FIELDS.join(','),
    '--limit',
    String(params.limit ?? 20),
  ];

  if (params.state) {
    args.push('--state', params.state);
  }
  if (params.branch) {
    args.push('--head', params.branch);
  }
  if (params.author) {
    args.push('--author', params.author);
  }
  if (params.label) {
    args.push('--label', params.label);
  }
  if (params.search) {
    args.push('--search', params.search);
  }

  try {
    const prs = await runGhJson<PRSummary[]>(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { filters: params, count: prs.length, prs },
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
          text: `Failed to list PRs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
