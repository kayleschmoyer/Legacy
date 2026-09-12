import { CLI_NOT_FOUND_PATTERN, cliNotFoundRemedy } from '../aws-error.js';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

/** Available Lambda function short names supported by this tool. */
export const LAMBDA_FUNCTIONS = [
  // App Lambdas
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
  'rollbar-discord',
  // Runner infrastructure Lambdas (github-aws-runners module)
  'runner-scale-up',
  'runner-scale-down',
  'runner-webhook',
  'runner-dispatch-to-runner',
  'runner-ssm-housekeeper',
  'runner-syncer',
] as const;

export type LambdaFunction = (typeof LAMBDA_FUNCTIONS)[number];

/** Maximum number of functions accepted in a single batch call. */
export const MAX_BATCH_FUNCTIONS = 10;
/** Maximum number of concurrent CloudWatch fetches in batch mode. */
export const BATCH_CONCURRENCY = 5;

/** Number of trailing log lines included in the markdown `### Recent` section. */
export const RECENT_LINES = 50;

/**
 * Default hard byte-size cap on the returned `logs` payload, applied in
 * addition to `maxLines`. High-volume log groups can produce entries that
 * are individually large multi-line JSON blocks, so a line-count cap alone
 * doesn't bound response size — this guards the tool/response budget
 * independently.
 */
export const DEFAULT_MAX_BYTES = 150_000;

/**
 * Buffer allotted to the underlying `aws logs tail` process, well above
 * `DEFAULT_MAX_BYTES`/`maxBytes` so a genuinely large fetch is captured in
 * full before this module's own byte cap truncates it — rather than being
 * cut off mid-stream by the child process's own stdout buffer limit.
 */
const CLI_MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Lines matching this pattern are extracted into the markdown `### Errors`
 * section. Covers AWS Lambda runtime errors (`ERROR`, `Error:`), warnings
 * (`WARN`), and thrown exception traces (`Exception`).
 */
export const ERROR_LINE_PATTERN = /\b(ERROR|WARN|Exception)\b|Error:/;

/** Lines treated as continuation of a preceding error (stack frames, etc.). */
const STACK_FRAME_PATTERN = /^\s+(at\s|Caused by:|\.\.\.|[A-Za-z_$][\w$.]*:\s)/;

export type LogsTailFormat = 'markdown' | 'json';

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  maxBuffer?: number,
) => Promise<string>;

const defaultRunner: CommandRunner = (cmd, args, cwd, maxBuffer) =>
  runCommand(cmd, args, cwd, {}, undefined, maxBuffer);

interface CommonParams {
  since: string;
  startTime?: string;
  endTime?: string;
  filter?: string;
  environment: string;
  maxLines: number;
  /** Hard byte-cap on the returned `logs` payload (default: {@link DEFAULT_MAX_BYTES}). */
  maxBytes?: number;
  format?: LogsTailFormat;
}

export interface LogsTailParams extends CommonParams {
  function?: string;
  functions?: string[];
}

export interface LogsTailSingleSuccess {
  logGroup: string;
  since: string;
  startTime?: string;
  endTime?: string;
  filter: string | null;
  truncated: boolean;
  totalLines?: number;
  shownLines?: number;
  truncationNotice?: string;
  logs: string;
}

export interface LogsTailSingleFailure {
  ok: false;
  logGroup: string;
  error: string;
  remedy: string | null;
  hint: string | null;
}

export type LogsTailSingleResult =
  | LogsTailSingleSuccess
  | LogsTailSingleFailure;

/**
 * Map a short function name to its actual CloudWatch log group name.
 * Matches the logic in scripts/aws-logs.ps1.
 */
function toLogGroup(functionName: string, environment: string): string {
  // stats-lambda maps to stats in the log group name
  const normalized = functionName === 'stats-lambda' ? 'stats' : functionName;
  return `/aws/lambda/legacy-sports-${environment}-${normalized}`;
}

/**
 * Extract error lines plus their trailing stack-frame continuations.
 *
 * An "error line" matches {@link ERROR_LINE_PATTERN}; subsequent indented lines
 * that look like stack frames (`  at ...`, `Caused by: ...`) are grouped with
 * the preceding error so the snippet remains readable.
 */
export function extractErrorLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ERROR_LINE_PATTERN.test(line)) continue;
    out.push(line);
    for (let j = i + 1; j < lines.length; j++) {
      if (STACK_FRAME_PATTERN.test(lines[j])) {
        out.push(lines[j]);
      } else {
        break;
      }
    }
  }
  return out;
}

interface MarkdownInput {
  logGroup: string;
  since: string;
  startTime?: string;
  endTime?: string;
  filter: string | null;
  rawText: string;
  totalLines: number;
  shownLines: number;
  truncated: boolean;
}

/**
 * Render a CloudWatch logs payload as markdown:
 * - `### Errors (N)` code block with extracted ERROR/WARN/Exception lines.
 * - `### Recent` code block with the last {@link RECENT_LINES} log lines.
 */
export function renderLogsAsMarkdown(input: MarkdownInput): string {
  const lines = input.rawText.split('\n');
  const errorLines = extractErrorLines(lines);
  const recent = lines.slice(-RECENT_LINES);

  const timeLabel = input.startTime
    ? `${input.startTime} → ${input.endTime ?? 'now'}`
    : input.since;

  const header = [
    `**logGroup**: ${input.logGroup}`,
    `**since**: ${timeLabel}`,
    `**filter**: ${input.filter ?? '(none)'}`,
    input.truncated
      ? `**lines**: ${input.shownLines} shown / ${input.totalLines} total (truncated)`
      : `**lines**: ${input.shownLines}`,
  ].join('\n');

  const errorsBody = errorLines.length > 0 ? errorLines.join('\n') : '(none)';

  return [
    header,
    '',
    `### Errors (${errorLines.length})`,
    '',
    '```',
    errorsBody,
    '```',
    '',
    `### Recent (last ${recent.length} lines)`,
    '',
    '```',
    recent.join('\n'),
    '```',
  ].join('\n');
}

function isFailure(
  result: LogsTailSingleResult,
): result is LogsTailSingleFailure {
  return 'ok' in result && result.ok === false;
}

/** Render a single-fn `LogsTailSingleResult` as a markdown block. */
function renderSingleResultAsMarkdown(
  result: LogsTailSingleResult,
  since: string,
): string {
  if (isFailure(result)) {
    const parts = [
      `**logGroup**: ${result.logGroup}`,
      `**error**: ${result.error}`,
    ];
    if (result.remedy) parts.push(`**remedy**: ${result.remedy}`);
    if (result.hint) parts.push(`**hint**: ${result.hint}`);
    return parts.join('\n');
  }
  const lineCount = result.logs.split('\n').length;
  return renderLogsAsMarkdown({
    logGroup: result.logGroup,
    since,
    startTime: result.startTime,
    endTime: result.endTime,
    filter: result.filter,
    rawText: result.logs,
    totalLines: result.totalLines ?? lineCount,
    shownLines: result.shownLines ?? lineCount,
    truncated: result.truncated,
  });
}

/**
 * Trim `text` down to at most `maxBytes` UTF-8 bytes, keeping the tail (most
 * recent content) and dropping the leading partial line so the result never
 * starts mid-line. Never errors on oversized input — the whole point of the
 * byte cap is a clean truncation instead of an overflow.
 */
export function truncateToByteLimit(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= maxBytes) return text;
  const sliced = buf.subarray(buf.byteLength - maxBytes);
  const decoded = sliced.toString('utf8');
  const firstNewline = decoded.indexOf('\n');
  return firstNewline === -1 ? decoded : decoded.slice(firstNewline + 1);
}

async function fetchOne(
  fn: string,
  params: CommonParams,
  runner: CommandRunner,
): Promise<LogsTailSingleResult> {
  const repoRoot = getRepoRoot();
  const logGroup = toLogGroup(fn, params.environment);

  const args = ['logs', 'tail', logGroup, '--no-cli-pager'];
  if (params.startTime) {
    args.push('--start-time', String(new Date(params.startTime).getTime()));
    if (params.endTime) {
      args.push('--end-time', String(new Date(params.endTime).getTime()));
    }
  } else {
    args.push('--since', params.since);
  }
  if (params.filter) {
    args.push('--filter-pattern', params.filter);
  }

  try {
    const output = await runner('aws', args, repoRoot, CLI_MAX_BUFFER);
    const rawText = output || '(no log events found in the given time range)';
    const MAX_LINES = params.maxLines;
    const MAX_BYTES = params.maxBytes ?? DEFAULT_MAX_BYTES;
    const lines = rawText.split('\n');
    const truncatedByLines = lines.length > MAX_LINES;
    const lineLimited = truncatedByLines
      ? lines.slice(lines.length - MAX_LINES)
      : lines;
    const totalLines = lines.length;

    let logsText = lineLimited.join('\n');
    let truncated = truncatedByLines;
    let truncatedByBytes = false;
    if (Buffer.byteLength(logsText, 'utf8') > MAX_BYTES) {
      logsText = truncateToByteLimit(logsText, MAX_BYTES);
      truncated = true;
      truncatedByBytes = true;
    }
    const shownLines = logsText.split('\n').length;

    const noticeParts: string[] = [];
    if (truncatedByLines) {
      noticeParts.push(`capped to last ${MAX_LINES} lines of ${totalLines}`);
    }
    if (truncatedByBytes) {
      noticeParts.push(`capped to last ${MAX_BYTES} bytes`);
    }

    return {
      logGroup,
      since: params.since,
      ...(params.startTime ? { startTime: params.startTime } : {}),
      ...(params.endTime ? { endTime: params.endTime } : {}),
      filter: params.filter ?? null,
      truncated,
      ...(truncated
        ? {
            totalLines,
            shownLines,
            truncationNotice: `Showing last ${shownLines} of ${totalLines} lines (${noticeParts.join('; ')})`,
          }
        : {}),
      logs: logsText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );
    const isUnknownOptionsError = /unknown options?:/i.test(message);
    const isCliNotFoundError = CLI_NOT_FOUND_PATTERN.test(message);
    return {
      ok: false,
      logGroup,
      error: message,
      remedy: isSsoError
        ? 'Run `aws sso login` to re-authenticate, then retry.'
        : isCliNotFoundError
          ? cliNotFoundRemedy()
          : isUnknownOptionsError
            ? 'The AWS CLI received an unrecognized option. Valid parameters for aws_logs_tail are: function, functions, since, startTime, endTime, filter, environment, maxLines, maxBytes, format. Check that no unexpected fields were passed.'
            : null,
      hint: isUnknownOptionsError
        ? 'Retry with only the documented aws_logs_tail input fields (function | functions, since [default: 1h], startTime [ISO-8601, optional], endTime [ISO-8601, optional], filter [optional], environment [dev|prod, default: dev], maxLines [optional], maxBytes [optional], format [markdown|json, default: markdown]). Remove any extra or misspelled fields.'
        : null,
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function toolError(message: string): ToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ ok: false, error: message }) },
    ],
    isError: true,
  };
}

export async function logsTail(
  params: LogsTailParams,
  runner: CommandRunner = defaultRunner,
): Promise<ToolResult> {
  const fns = params.functions;
  const format: LogsTailFormat = params.format ?? 'markdown';

  if (fns && fns.length > 0) {
    if (params.function) {
      return toolError(
        'Provide either `function` (singular) or `functions` (batch), not both.',
      );
    }
    if (fns.length > MAX_BATCH_FUNCTIONS) {
      return toolError(
        `Batch mode accepts at most ${MAX_BATCH_FUNCTIONS} functions; received ${fns.length}.`,
      );
    }

    // Failures are isolated per-function: fetchOne catches its own errors and
    // returns a failure object under the function's key, so one bad function
    // never fails its peers.
    const results = await runWithConcurrency(fns, BATCH_CONCURRENCY, (fn) =>
      fetchOne(fn, params, runner),
    );

    if (format === 'markdown') {
      const body = fns
        .map(
          (fn, i) =>
            `## ${fn}\n\n${renderSingleResultAsMarkdown(results[i], params.since)}`,
        )
        .join('\n\n');
      return { content: [{ type: 'text', text: body }] };
    }

    const logs: Record<string, LogsTailSingleResult> = {};
    fns.forEach((fn, i) => {
      logs[fn] = results[i];
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ logs }) }],
    };
  }

  if (!params.function) {
    return toolError('Either `function` or `functions` must be provided.');
  }

  const result = await fetchOne(params.function, params, runner);
  const failed = isFailure(result);

  if (format === 'markdown') {
    const text = renderSingleResultAsMarkdown(result, params.since);
    return failed
      ? { content: [{ type: 'text', text }], isError: true }
      : { content: [{ type: 'text', text }] };
  }

  const text = JSON.stringify(result);
  return failed
    ? { content: [{ type: 'text', text }], isError: true }
    : { content: [{ type: 'text', text }] };
}
