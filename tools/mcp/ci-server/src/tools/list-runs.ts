import { parseJson, runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ListRunsParams {
  branch?: string;
  workflow?: string;
  status?: string;
  event?: string;
  commit?: string;
  user?: string;
  limit?: number;
}

interface RunSummary {
  attempt: number;
  conclusion: string | null;
  createdAt: string;
  databaseId: number;
  displayTitle: string;
  event: string;
  headBranch: string;
  headSha: string;
  name: string;
  number: number;
  startedAt: string | null;
  status: string;
  updatedAt: string;
  url: string;
  workflowDatabaseId: number;
  workflowName: string | null;
}

const RUN_FIELDS = [
  'attempt',
  'conclusion',
  'createdAt',
  'databaseId',
  'displayTitle',
  'event',
  'headBranch',
  'headSha',
  'name',
  'number',
  'startedAt',
  'status',
  'updatedAt',
  'url',
  'workflowDatabaseId',
  'workflowName',
];

export async function listRuns(params: ListRunsParams): Promise<ToolResult> {
  const args = [
    'run',
    'list',
    '--json',
    RUN_FIELDS.join(','),
    '--limit',
    String(params.limit ?? 10),
  ];

  if (params.branch) {
    args.push('--branch', params.branch);
  }
  if (params.workflow) {
    args.push('--workflow', params.workflow);
  }
  if (params.status) {
    args.push('--status', params.status);
  }
  if (params.event) {
    args.push('--event', params.event);
  }
  if (params.commit) {
    args.push('--commit', params.commit);
  }
  if (params.user) {
    args.push('--user', params.user);
  }

  try {
    const runs = parseJson<RunSummary[]>(await runGh(args));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              filters: params,
              count: runs.length,
              runs,
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
          text: `Failed to list workflow runs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
