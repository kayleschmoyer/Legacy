import { fetchRunLogs } from '../logs.js';
import type { ToolResult } from '../types.js';

interface SearchLogsParams {
  runId: number;
  pattern: string;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  isRegex?: boolean;
  caseSensitive?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  limitMatches?: number;
}

interface LogMatch {
  lineNumber: number;
  line: string;
  before: string[];
  after: string[];
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
  const contextBefore = params.contextBefore ?? 3;
  const contextAfter = params.contextAfter ?? 3;
  const limitMatches = params.limitMatches ?? 10;

  try {
    const rawLogs = await fetchRunLogs(params);
    const lines = rawLogs.split(/\r?\n/);
    const matches: LogMatch[] = [];
    const isMatch = buildMatcher(params);
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
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              failedOnly: params.failedOnly !== false,
              pattern: params.pattern,
              isRegex: params.isRegex ?? false,
              caseSensitive: params.caseSensitive ?? false,
              totalMatches,
              returnedMatches: matches.length,
              truncated: totalMatches > matches.length,
              matches,
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
          text: `Failed to search logs for workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
