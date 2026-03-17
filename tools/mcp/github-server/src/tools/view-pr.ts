import { runGhJson } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ViewPRParams {
  number: number;
}

const PR_FIELDS = [
  'number',
  'title',
  'body',
  'state',
  'headRefName',
  'baseRefName',
  'author',
  'createdAt',
  'updatedAt',
  'mergedAt',
  'closedAt',
  'url',
  'labels',
  'isDraft',
  'reviewDecision',
  'additions',
  'deletions',
  'changedFiles',
  'commits',
  'statusCheckRollup',
  'reviews',
  'assignees',
  'milestone',
];

export async function viewPR(params: ViewPRParams): Promise<ToolResult> {
  const args = [
    'pr',
    'view',
    String(params.number),
    '--json',
    PR_FIELDS.join(','),
  ];

  try {
    const pr = await runGhJson<unknown>(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to view PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
