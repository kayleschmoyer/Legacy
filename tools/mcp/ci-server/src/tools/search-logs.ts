import { formatLogSearch, type LogMatch } from '../format.js';
import { fetchRunLogs, stripAnsiCodes, unsafePatternReason } from '../logs.js';
import type { ToolResult } from '../types.js';

/** Deadline for a single ci_search_logs call — leaves ~5 s buffer before Lambda 30 s timeout. */
const SEARCH_FETCH_TIMEOUT_MS = 20_000;

interface SearchLogsParams {
  runId?: number;
  pattern: string;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  isRegex?: boolean;
  caseSensitive?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  limitMatches?: number;
  truncateLineLength?: number;
  maxChars?: number;
}

function buildMatcher(params: SearchLogsParams): (line: string) => boolean {
  if (params.isRegex) {
    const flags = params.caseSensitive ? '' : 'i';
    const regex = new RegExp(params.pattern, flags);
    return (line: string) => regex.test(line);
  }

  const needle = params.caseSensitive
    ? params.pattern
    : params.pattern.toLowerCase();
  return (line: string) => {
    const haystack = params.caseSensitive ? line : line.toLowerCase();
    return haystack.includes(needle);
  };
}

export async function searchLogs(
  params: SearchLogsParams,
): Promise<ToolResult> {
  if (!params.runId && !params.jobId) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Either runId or jobId is required.' }],
    };
  }

  // Reject ReDoS-prone regex patterns before touching the logs. Only matters
  // when isRegex is set; literal substring search has no backtracking risk.
  if (params.isRegex) {
    const reason = unsafePatternReason(params.pattern);
    if (reason) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unsafe regex pattern: ${reason}.` }],
      };
    }
  }

  const contextBefore = params.contextBefore ?? 3;
  const contextAfter = params.contextAfter ?? 3;
  const limitMatches = params.limitMatches ?? 10;

  let isMatch: (line: string) => boolean;
  try {
    isMatch = buildMatcher(params);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Invalid regex pattern "${params.pattern}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  try {
    const rawLogs = await fetchRunLogs({
      ...params,
      signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
    });
    // Strip ANSI escape sequences before matching (LS-9557) — both so
    // returned matches/context are clean and so a literal pattern like
    // "● FootballLeagueId" matches text that would otherwise have escape
    // codes sitting between the bullet and the name.
    const lines = rawLogs.text.split(/\r?\n/).map(stripAnsiCodes);
    const matches: LogMatch[] = [];
    let totalMatches = 0;

    for (const [index, line] of lines.entries()) {
      if (!isMatch(line)) {
        continue;
      }

      totalMatches += 1;
      if (matches.length >= limitMatches) {
        continue;
      }

      matches.push({
        lineNumber: index + 1,
        line,
        before: lines.slice(Math.max(0, index - contextBefore), index),
        after: lines.slice(index + 1, index + 1 + contextAfter),
      });
    }

    // LS-9389: `skippedByFailedOnly` only fires when failedOnly filtered out
    // *every* job (jobs.length === 0), which previously left a partial-scope
    // search — e.g. failedOnly excluding some (not all) successful jobs, or
    // the MAX_LOG_JOBS per-call cap — completely unflagged. A caller reading
    // `totalMatches: 0` alongside `jobsSearched: 5, jobsTotal: 16` had no
    // signal that 11 unsearched jobs could hold the pattern, which is exactly
    // what happened in the LS-9389 repro (the match lived in a *passing* job
    // excluded by failedOnly's default). Any time jobsSearched < jobsTotal,
    // surface it so a zero-match result is never read as a clean negative.
    const jobsUnsearched = rawLogs.jobsTotal - rawLogs.jobsSearched;
    const partialCoverage = jobsUnsearched > 0;
    const scopeNote = rawLogs.skippedByFailedOnly
      ? `0 of ${rawLogs.jobsTotal} job(s) were searched — all were excluded by failedOnly=true (default). Retry with failedOnly=false to search successful-job logs too.`
      : partialCoverage
        ? `${rawLogs.jobsSearched} of ${rawLogs.jobsTotal} job(s) were searched — ${jobsUnsearched} job(s) were not searched (excluded by failedOnly=true and/or the per-call job cap). A 0-match result does NOT mean the pattern is absent from the run. Retry with failedOnly=false and/or jobName/jobId to cover the remaining job(s).`
        : undefined;

    return {
      content: [
        {
          type: 'text',
          text: formatLogSearch(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              pattern: params.pattern,
              totalMatches,
              returnedMatches: matches.length,
              truncated: totalMatches > matches.length || partialCoverage,
              jobsSearched: rawLogs.jobsSearched,
              jobsTotal: rawLogs.jobsTotal,
              ...(scopeNote ? { scopeNote } : {}),
            },
            matches,
            {
              truncateLineLength: params.truncateLineLength,
              maxChars: params.maxChars,
            },
          ),
        },
      ],
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    const base = params.jobId
      ? `job ${params.jobId}`
      : `workflow run ${params.runId}`;
    const detail = isTimeout
      ? `timed out after ${SEARCH_FETCH_TIMEOUT_MS / 1000}s — the run may have many or large jobs. Retry with jobName or jobId to narrow scope.`
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to search logs for ${base}: ${detail}`,
        },
      ],
    };
  }
}
