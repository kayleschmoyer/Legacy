import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

/** Available Lambda function short names supported by this tool. */
export const LAMBDA_FUNCTIONS = [
  'graphql',
  'db',
  'oauth-proxy',
  'notifications',
  'stats',
  'stats-lambda',
  'game-selection',
  'draft-processor',
  'websocket',
  'apple-iap',
  'stripe-webhook',
] as const;

export type LambdaFunction = (typeof LAMBDA_FUNCTIONS)[number];

interface LogsTailParams {
  function: string;
  since: string;
  filter?: string;
  environment: string;
}

/**
 * Map a short function name to its actual CloudWatch log group name.
 * Matches the logic in scripts/aws-logs.ps1.
 */
function toLogGroup(functionName: string, environment: string): string {
  // stats-lambda maps to stats in the log group name
  const normalized = functionName === 'stats-lambda' ? 'stats' : functionName;
  return `/aws/lambda/legacy-sports-${environment}-${normalized}`;
}

export async function logsTail(params: LogsTailParams): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const logGroup = toLogGroup(params.function, params.environment);

  const args = [
    'logs',
    'tail',
    logGroup,
    '--since',
    params.since,
    '--no-cli-pager',
  ];

  if (params.filter) {
    args.push('--filter-pattern', params.filter);
  }

  try {
    const output = await runCommand('aws', args, repoRoot);
    const text = output || '(no log events found in the given time range)';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            logGroup,
            since: params.since,
            filter: params.filter ?? null,
            logs: text,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            logGroup,
            error: message,
            remedy: isSsoError
              ? 'Run `aws sso login` to re-authenticate, then retry.'
              : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
