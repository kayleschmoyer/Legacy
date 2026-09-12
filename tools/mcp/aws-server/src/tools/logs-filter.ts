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
  logGroup: string;
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

export async function logsFilter(
  params: LogsFilterParams,
  runner: CommandRunner = defaultRunner,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const format: LogsFilterFormat = params.format ?? 'markdown';
  const limit = Math.min(params.limit ?? 100, MAX_EVENTS);

  const args = [
    'logs',
    'filter-log-events',
    '--log-group-name',
    params.logGroup,
    '--limit',
    String(limit),
    '--output',
    'json',
    '--no-cli-pager',
  ];

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
      logGroup: params.logGroup,
      filterPattern: params.filterPattern ?? null,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
      events,
      count: events.length,
      truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );
    result = {
      ok: false,
      logGroup: params.logGroup,
      error: message,
      remedy: isSsoError
        ? 'Run `aws sso login` to re-authenticate, then retry.'
        : null,
      hint: null,
    };
  }

  if (format === 'markdown') {
    const text = renderAsMarkdown(result);
    return isFailure(result)
      ? { content: [{ type: 'text', text }], isError: true }
      : { content: [{ type: 'text', text }] };
  }

  const text = JSON.stringify(result);
  return isFailure(result)
    ? { content: [{ type: 'text', text }], isError: true }
    : { content: [{ type: 'text', text }] };
}
