import { runGh } from './gh.js';

export interface FetchRunLogsParams {
  runId: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
}

/** Build the `gh run view` args array for log retrieval. */
export function buildLogArgs(params: FetchRunLogsParams): string[] {
  const args = ['run', 'view', String(params.runId)];

  if (params.attempt) {
    args.push('--attempt', String(params.attempt));
  }

  if (params.jobId) {
    args.push('--job', String(params.jobId));
  }

  args.push(params.failedOnly === false ? '--log' : '--log-failed');
  return args;
}

export async function fetchRunLogs(
  params: FetchRunLogsParams,
): Promise<string> {
  return runGh(buildLogArgs(params));
}
