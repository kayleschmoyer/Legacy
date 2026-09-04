// Token-efficient response formatting for the ci-server's high-traffic,
// list-shaped tools (epic LS-8018 / LS-8022). The shared standard and rationale
// live in `.agents/skills/create/references/mcp-response-format.md`; this module
// holds the ci-server's column selections + pure formatters so the tool handlers
// stay thin and the formatting is unit-testable without mocking the network.
//
// Levers, in priority order (see the standard): field selection first
// (`pickFields` — a dropped column costs zero tokens in every row of every
// call), blob truncation second (`truncate` — cap long log lines), format third
// (flat uniform lists → `markdownTable`; nested/heterogeneous → `minifiedJson`).

import {
  markdownTable,
  minifiedJson,
  pickFields,
  truncate,
} from '@legacy-sports/mcp-format';

/** A flat record we render to a Markdown-table row. */
type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// ci_list_runs — flat uniform list → Markdown table.
// ---------------------------------------------------------------------------

/**
 * Columns surfaced for a workflow-run list. Pruned from the 17 fields `mapRun`
 * produces: `databaseId` duplicates `id`, `workflowName` duplicates `name`,
 * `url` is derivable from `id`, and `startedAt`/`updatedAt`/
 * `workflowDatabaseId`/`attempt` are rarely read off a list (agents fetch run
 * detail when they need them). `id` is the value follow-up tools take as `runId`.
 *
 * `headSha` (short form) is included (LS-9584): `headBranch` is identical
 * across every run on a branch, so without a commit it's impossible to tell
 * which run belongs to the current head after a force-push/amend and which
 * belongs to a superseded SHA — a recurring source of false-red triage.
 */
export const RUN_LIST_COLUMNS = [
  'id',
  'name',
  'status',
  'conclusion',
  'event',
  'headBranch',
  'headSha',
  'number',
  'displayTitle',
  'createdAt',
] as const;

/** Cap the commit/PR title so one verbose row can't dominate the table. */
const RUN_DISPLAY_TITLE_MAX = 80;

/** Short-SHA length, matching `gh run list --json headSha`'s conventional prefix. */
const RUN_HEAD_SHA_SHORT_LENGTH = 9;

/**
 * Render a workflow-run list as a compact Markdown table. Returns an explicit
 * empty-state string (never a blank table) so the agent isn't handed `''`.
 */
export function formatRunList(runs: readonly Row[]): string {
  if (runs.length === 0) return 'No workflow runs found.';
  const rows = pickFields(runs, RUN_LIST_COLUMNS).map((run) => ({
    ...run,
    headSha:
      typeof run.headSha === 'string'
        ? run.headSha.slice(0, RUN_HEAD_SHA_SHORT_LENGTH)
        : run.headSha,
    displayTitle: truncate(
      typeof run.displayTitle === 'string' ? run.displayTitle : '',
      RUN_DISPLAY_TITLE_MAX,
    ),
  }));
  return markdownTable(rows, { columns: RUN_LIST_COLUMNS });
}

// ---------------------------------------------------------------------------
// ci_view_run_jobs — scalar summary (minified JSON) + job list (table, or
// minified JSON when per-step detail is requested and the rows nest).
// ---------------------------------------------------------------------------

/**
 * Columns surfaced for a job list. `databaseId` is the value `ci_search_logs` /
 * `ci_get_logs` take as `jobId`; timestamps are dropped (agents read pass/fail
 * and drill into logs, not per-job durations, off a job list).
 */
export const JOB_LIST_COLUMNS = [
  'databaseId',
  'name',
  'status',
  'conclusion',
] as const;

/**
 * Format a run's job breakdown: a minified-JSON header carrying `runId` +
 * `summary` (a single scalar object — a table would only add noise), followed by
 * the jobs. Jobs render as a Markdown table normally; when `includeSteps` is set
 * each job carries a nested `steps` array, so the whole list falls back to
 * minified JSON (the table is for flat rows only).
 */
export function formatRunJobs(
  runId: number,
  summary: Record<string, unknown>,
  jobs: readonly Row[],
  includeSteps: boolean,
): string {
  const header = minifiedJson({ runId, summary });
  let body: string;
  if (jobs.length === 0) {
    body = 'No jobs found.';
  } else if (includeSteps) {
    body = minifiedJson(jobs);
  } else {
    body = markdownTable(pickFields(jobs, JOB_LIST_COLUMNS), {
      columns: JOB_LIST_COLUMNS,
    });
  }
  return `${header}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// ci_search_logs — nested matches (before/after context arrays) → minified JSON.
// ---------------------------------------------------------------------------

/** A single log-search hit with its surrounding context lines. */
export interface LogMatch {
  lineNumber: number;
  line: string;
  before: string[];
  after: string[];
}

/** Result metadata agents read; input-echo flags an agent already knows are dropped. */
export interface LogSearchMeta {
  runId?: number;
  jobId: number | null;
  pattern: string;
  totalMatches: number;
  returnedMatches: number;
  /**
   * True when the response is incomplete in *either* sense: more matches
   * exist than were returned (`totalMatches > returnedMatches`), or the
   * search itself covered fewer jobs than exist in the run's scope
   * (`jobsSearched < jobsTotal`, e.g. failedOnly excluding some jobs, or the
   * per-call job cap) — LS-9389. Either condition means the result is not
   * safe to read as an authoritative "the pattern is absent".
   */
  truncated: boolean;
  /** Number of jobs whose logs were actually fetched and searched. */
  jobsSearched: number;
  /** Total number of jobs in scope (after jobName filtering, before failedOnly). */
  jobsTotal: number;
  /**
   * Present whenever `jobsSearched < jobsTotal` — either because `failedOnly`
   * filtered out every job (jobs existed but none were searched) or some
   * (successful jobs excluded by failedOnly, or jobs beyond the per-call cap)
   * — so a bare `totalMatches: 0` is never mistaken for "content was searched
   * and the pattern is absent" (LS-9389, recurrence of LS-8301).
   */
  scopeNote?: string;
}

/** Cap a matched log line; long stack traces / JSON dumps would blow the budget. */
const LOG_LINE_MAX = 500;
/** Context lines are secondary — cap them tighter than the matched line. */
const LOG_CONTEXT_MAX = 200;
/**
 * Hard cap, in characters, on the full serialized response — mirrors
 * ci_get_logs's `maxChars` backstop. Per-line truncation alone doesn't bound
 * the total: enough matches with long context arrays can still overflow the
 * token limit even when every individual line is capped (LS-8390).
 */
export const DEFAULT_LOG_SEARCH_MAX_CHARS = 50_000;

export interface FormatLogSearchOptions {
  /**
   * Per-line truncation length applied to every line — the matched line and
   * every before/after context line — in every match. Mirrors ci_get_logs's
   * `truncateLineLength`. Omit to keep the default asymmetric caps (500 for
   * the matched line, 200 for context lines).
   */
  truncateLineLength?: number;
  /**
   * Hard cap on the full serialized response (default {@link
   * DEFAULT_LOG_SEARCH_MAX_CHARS}). When per-line truncation alone still
   * leaves the response over this limit, trailing matches are dropped one at
   * a time until it fits, rather than returning an unparseable oversized blob.
   */
  maxChars?: number;
}

/**
 * Format log-search results as minified JSON. The matches nest `before`/`after`
 * context arrays, so a table doesn't apply; minified JSON keeps it
 * machine-parseable without pretty-print whitespace. Each line is truncated with
 * a `…+{omitted}` marker so a single long line can't dominate, and the full
 * response is capped by total character count so a large match count times
 * long context arrays can't overflow it either.
 */
export function formatLogSearch(
  meta: LogSearchMeta,
  matches: readonly LogMatch[],
  options: FormatLogSearchOptions = {},
): string {
  const lineMax = options.truncateLineLength ?? LOG_LINE_MAX;
  const contextMax = options.truncateLineLength ?? LOG_CONTEXT_MAX;
  const maxChars = options.maxChars ?? DEFAULT_LOG_SEARCH_MAX_CHARS;

  const capped = matches.map((match) => ({
    lineNumber: match.lineNumber,
    line: truncate(match.line, lineMax, { showOmitted: true }),
    before: match.before.map((l) =>
      truncate(l, contextMax, { showOmitted: true }),
    ),
    after: match.after.map((l) =>
      truncate(l, contextMax, { showOmitted: true }),
    ),
  }));

  let kept = capped.length;
  let out = minifiedJson({ ...meta, matches: capped });
  while (out.length > maxChars && kept > 0) {
    kept -= 1;
    out = minifiedJson({
      ...meta,
      returnedMatches: kept,
      truncated: true,
      charTruncated: true,
      matches: capped.slice(0, kept),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ci_session_stats — single nested object (tool-count maps + subagent array) →
// minified JSON.
// ---------------------------------------------------------------------------

/**
 * Drop `jsonlPath` (a long absolute local path agents don't consume off the
 * stats) at the parent and recursively across `subagentStats`. Everything else —
 * `toolCounts`, `bashFallbackRatio`, message/line totals — is preserved.
 */
function stripJsonlPath(
  stats: Record<string, unknown>,
): Record<string, unknown> {
  const { jsonlPath: _jsonlPath, subagentStats, ...rest } = stats;
  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray(subagentStats)) {
    out.subagentStats = subagentStats.map((sub) =>
      stripJsonlPath(sub as Record<string, unknown>),
    );
  }
  return out;
}

/**
 * Format session stats as minified JSON. A single nested object (with a
 * `toolCounts` map and optional `subagentStats` array) — a table doesn't apply;
 * pruning the verbose `jsonlPath` is the first-order saving.
 */
export function formatSessionStats(stats: Record<string, unknown>): string {
  return minifiedJson(stripJsonlPath(stats));
}

// ---------------------------------------------------------------------------
// ci_get_logs — scalar metadata + a single large multi-line string → minified
// JSON header followed by raw log text (LS-8504).
// ---------------------------------------------------------------------------

/**
 * Render a log-shaped result as a minified-JSON metadata header, blank line,
 * then the raw log text. Embedding a multi-thousand-line log inside a JSON
 * string field (the previous behavior — `JSON.stringify({ ...meta, logs })`)
 * forces every newline in that field to be escaped to the two-character `\n`
 * sequence, since raw newline bytes are illegal inside a JSON string. That
 * collapses the whole log to one physical line — which is exactly what
 * breaks `grep -n` and offset/limit-chunked `Read` against an
 * overflow-persisted `tool-results/*.txt` file, defeating the tool's own
 * printed recovery instructions. Keeping the log text outside any JSON
 * string preserves real newline bytes, so both recovery paths work as
 * documented once the response is large enough to be persisted to disk.
 */
export function formatLogPayload(
  meta: Record<string, unknown>,
  logs: string,
): string {
  return `${minifiedJson(meta)}\n\n${logs}`;
}

/** One run's result in a `ci_get_logs({ runIds })` batch call. */
export interface BatchLogRun {
  runId: number;
  meta: Record<string, unknown>;
  logs: string;
}

/**
 * Render a batch `ci_get_logs({ runIds })` result: a minified-JSON header
 * (the run IDs in scope + any `missing` entries) followed by one
 * `formatLogPayload`-shaped section per successful run, separated by a
 * `=== run <id> ===` marker line. Same rationale as {@link formatLogPayload} —
 * every run's log text stays outside any JSON string so it keeps real
 * newlines through overflow persistence.
 */
export function formatBatchLogPayload(
  missing: ReadonlyArray<{ runId: number; reason: string }>,
  runs: readonly BatchLogRun[],
): string {
  const header = minifiedJson({ runIds: runs.map((r) => r.runId), missing });
  const sections = runs.map(
    (run) =>
      `\n\n=== run ${run.runId} ===\n${formatLogPayload(run.meta, run.logs)}`,
  );
  return header + sections.join('');
}
