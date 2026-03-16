import { parseJson, runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ViewRunParams {
  runId: number;
  attempt?: number;
  includeJobs?: boolean;
}

const BASE_FIELDS = [
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

export async function viewRun(params: ViewRunParams): Promise<ToolResult> {
  const fields =
    params.includeJobs === false ? BASE_FIELDS : [...BASE_FIELDS, 'jobs'];
  const args = [
    'run',
    'view',
    String(params.runId),
    '--json',
    fields.join(','),
  ];

  if (params.attempt) {
    args.push('--attempt', String(params.attempt));
  }

  try {
    const run = parseJson<unknown>(await runGh(args));
    return {
      content: [{ type: 'text', text: JSON.stringify(run, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to view workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
