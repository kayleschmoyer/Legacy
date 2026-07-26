import { formatLogSearch, type LogMatch } from '../format.js';
import { fetchRunLogs } from '../logs.js';
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

/**
 * Hard cap on a user-supplied regex pattern. Log-search patterns are short by
 * nature; a very long pattern is both unnecessary and a ReDoS smell.
 */
const MAX_PATTERN_LENGTH = 1000;

/**
 * Heuristic guard against catastrophic-backtracking (ReDoS) patterns. Node has
 * no synchronous way to time-box a regex execution, so we reject the pattern
 * *shapes* that cause exponential backtracking before compiling: a parenthesised
 * group that itself contains an unbounded quantifier and is in turn quantified
 * (e.g. `(a+)+`, `(a*)*`, `(a+)*`, `(a+){2,}`). Returns a human-readable reason,
 * or `null` when the pattern is acceptable. Only applies when `isRegex` is set —
 * literal substring search (the default) carries no backtracking risk.
 */
function unsafePatternReason(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH} characters)`;
  }
  // A group containing an unbounded quantifier (`+`, `*`, or `{`), immediately
  // followed by another unbounded quantifier — the classic ReDoS shape.
  const nestedQuantifier = /\([^()]*[+*{][^()]*\)[+*{]/;
  if (nestedQuantifier.test(pattern)) {
    return 'pattern contains nested quantifiers (possible ReDoS); simplify the pattern or set isRegex=false for a literal substring search';
  }
  return null;
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
    const lines = rawLogs.split(/\r?\n/);
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
              truncated: totalMatches > matches.length,
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
