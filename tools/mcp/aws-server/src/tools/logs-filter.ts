import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

export const MAX_EVENTS = 50;
export const MAX_CHARS = 20_000;

export type LogsFilterFormat = 'markdown' | 'json';

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<string>;

const defaultRunner: CommandRunner = (cmd, args, cwd) =>
  runCommand(cmd, args, cwd);

export interface LogsFilterParams {
  logGroup?: string;
  /** Log-group name prefix: list matching groups instead of searching events. */
  listGroups?: string;
  logStreamNames?: string[];
  filterPattern?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  format?: LogsFilterFormat;
}

export interface LogEvent {
  timestamp: number;
  message: string;
  logStreamName?: string;
}

export interface LogsFilterSuccess {
  logGroup: string;
  filterPattern: string | null;
  startTime: number | null;
  endTime: number | null;
  events: LogEvent[];
  count: number;
  truncated: boolean;
}

export interface LogsFilterFailure {
  ok: false;
  logGroup: string;
  error: string;
  remedy: string | null;
  hint: string | null;
}

export type LogsFilterResult = LogsFilterSuccess | LogsFilterFailure;

function isFailure(r: LogsFilterResult): r is LogsFilterFailure {
  return 'ok' in r && r.ok === false;
}

function renderAsMarkdown(result: LogsFilterResult): string {
  if (isFailure(result)) {
    const parts = [
      `**logGroup**: ${result.logGroup}`,
      `**error**: ${result.error}`,
    ];
    if (result.remedy) parts.push(`**remedy**: ${result.remedy}`);
    if (result.hint) parts.push(`**hint**: ${result.hint}`);
    return parts.join('\n');
  }

  const header = [
    `**logGroup**: ${result.logGroup}`,
    `**filterPattern**: ${result.filterPattern ?? '(none)'}`,
    result.startTime != null
      ? `**startTime**: ${new Date(result.startTime).toISOString()}`
      : null,
    result.endTime != null
      ? `**endTime**: ${new Date(result.endTime).toISOString()}`
      : null,
    result.truncated
      ? `**events**: ${result.count} shown (truncated at ${MAX_EVENTS} events or ${MAX_CHARS} chars)`
      : `**events**: ${result.count}`,
  ]
    .filter(Boolean)
    .join('\n');

  const body =
    result.events.length === 0
      ? '(no log events found)'
      : result.events
          .map((e) => {
            const ts = new Date(e.timestamp).toISOString();
            return `[${ts}] ${e.message.trimEnd()}`;
          })
          .join('\n');

  return [`${header}`, '', '```', body, '```'].join('\n');
}

interface AwsLogEvent {
  timestamp?: number;
  message?: string;
  logStreamName?: string;
}

interface AwsFilterResponse {
  events?: AwsLogEvent[];
}

interface AwsLogGroup {
  logGroupName?: string;
  retentionInDays?: number;
  storedBytes?: number;
}

interface AwsDescribeLogGroupsResponse {
  logGroups?: AwsLogGroup[];
  nextToken?: string;
}

function failureResult(
  logGroup: string,
  err: unknown,
  format: LogsFilterFormat,
): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  const isSsoError =
    /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
      message,
    );
  const failure: LogsFilterFailure = {
    ok: false,
    logGroup,
    error: message,
    remedy: isSsoError
      ? 'Run `aws sso login` to re-authenticate, then retry.'
      : null,
    hint: null,
  };
  const text =
    format === 'markdown' ? renderAsMarkdown(failure) : JSON.stringify(failure);
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * `listGroups` mode: enumerate log groups by name prefix, so a caller that
 * guessed a group name wrong (ResourceNotFoundException) can discover the real
 * one without shelling out to `aws logs describe-log-groups`.
 */
async function listLogGroups(
  prefix: string,
  format: LogsFilterFormat,
  runner: CommandRunner,
): Promise<ToolResult> {
  try {
    const output = await runner(
      'aws',
      [
        'logs',
        'describe-log-groups',
        '--log-group-name-prefix',
        prefix,
        '--limit',
        String(MAX_EVENTS),
        '--output',
        'json',
        '--no-cli-pager',
      ],
      getRepoRoot(),
    );
    const parsed: AwsDescribeLogGroupsResponse = output
      ? (JSON.parse(output) as AwsDescribeLogGroupsResponse)
      : {};
    const logGroups = (parsed.logGroups ?? []).map((g) => ({
      name: g.logGroupName ?? '',
      retentionInDays: g.retentionInDays ?? null,
      storedBytes: g.storedBytes ?? null,
    }));
    const truncated = Boolean(parsed.nextToken);

    const text =
      format === 'markdown'
        ? [
            `**prefix**: ${prefix}`,
            `**logGroups**: ${logGroups.length}${truncated ? ` shown (truncated at ${MAX_EVENTS}; narrow the prefix)` : ''}`,
            '',
            ...(logGroups.length === 0
              ? ['(no log groups found)']
              : logGroups.map(
                  (g) =>
                    `- ${g.name} (retentionInDays: ${g.retentionInDays ?? 'never expires'}, storedBytes: ${g.storedBytes ?? 'unknown'})`,
                )),
          ].join('\n')
        : JSON.stringify({
            prefix,
            logGroups,
            count: logGroups.length,
            truncated,
          });
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return failureResult(prefix, err, format);
  }
}

export async function logsFilter(
  params: LogsFilterParams,
  runner: CommandRunner = defaultRunner,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const format: LogsFilterFormat = params.format ?? 'markdown';
  const limit = Math.min(params.limit ?? 100, MAX_EVENTS);

  if (params.listGroups) {
    return listLogGroups(params.listGroups, format, runner);
  }

  const logGroup = params.logGroup;
  if (!logGroup) {
    return failureResult(
      '(none)',
      'Either `logGroup` or `listGroups` must be provided.',
      format,
    );
  }

  const args = [
    'logs',
    'filter-log-events',
    '--log-group-name',
    logGroup,
    '--limit',
    String(limit),
    '--output',
    'json',
    '--no-cli-pager',
  ];

  if (params.logStreamNames && params.logStreamNames.length > 0) {
    args.push('--log-stream-names', ...params.logStreamNames);
  }
  if (params.filterPattern) {
    args.push('--filter-pattern', params.filterPattern);
  }
  if (params.startTime != null) {
    args.push('--start-time', String(params.startTime));
  }
  if (params.endTime != null) {
    args.push('--end-time', String(params.endTime));
  }

  let result: LogsFilterResult;
  try {
    const output = await runner('aws', args, repoRoot);
    const parsed: AwsFilterResponse = output
      ? (JSON.parse(output) as AwsFilterResponse)
      : {};
    const rawEvents: AwsLogEvent[] = parsed.events ?? [];

    // Apply char-budget truncation on top of event-count limit
    let charCount = 0;
    const events: LogEvent[] = [];
    let truncated = false;
    for (const e of rawEvents) {
      const msg = e.message ?? '';
      if (charCount + msg.length > MAX_CHARS) {
        truncated = true;
        break;
      }
      charCount += msg.length;
      events.push({
        timestamp: e.timestamp ?? 0,
        message: msg,
        logStreamName: e.logStreamName,
      });
    }
    if (!truncated && rawEvents.length >= limit) {
      truncated = true;
    }

    result = {
      logGroup,
      filterPattern: params.filterPattern ?? null,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
      events,
      count: events.length,
      truncated,
    };
  } catch (err) {
    return failureResult(logGroup, err, format);
  }

  const text =
    format === 'markdown' ? renderAsMarkdown(result) : JSON.stringify(result);
  return { content: [{ type: 'text', text }] };
}
