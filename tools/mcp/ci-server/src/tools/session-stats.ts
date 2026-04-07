import { createReadStream, type ReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  findClaudeProjectsDir,
  listSessionJsonls,
  resolveProjectSlug,
  type SessionJsonl,
} from '../session-files.js';
import type { ToolResult } from '../types.js';

export interface SessionStatsParams {
  sessionId?: string;
  project?: string;
  lineRange?: [number, number];
  includeSubagents?: boolean;
}

interface RawCounts {
  totalLines: number;
  totalMessages: number;
  firstMessageAt: string;
  lastMessageAt: string;
  toolCounts: Record<string, number>;
}

interface SessionStats extends RawCounts {
  sessionId: string;
  jsonlPath: string;
  bashFallbackRatio: number;
  subagentStats?: SessionStats[];
}

function blankCounts(): RawCounts {
  return {
    totalLines: 0,
    totalMessages: 0,
    firstMessageAt: '',
    lastMessageAt: '',
    toolCounts: {},
  };
}

function processLine(counts: RawCounts, line: string): void {
  if (!line || !line.trim()) return;

  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }
  if (!record || typeof record !== 'object') return;

  const rec = record as Record<string, unknown>;
  counts.totalMessages++;

  const ts = typeof rec.timestamp === 'string' ? rec.timestamp : '';
  if (ts) {
    if (!counts.firstMessageAt || ts < counts.firstMessageAt) {
      counts.firstMessageAt = ts;
    }
    if (!counts.lastMessageAt || ts > counts.lastMessageAt) {
      counts.lastMessageAt = ts;
    }
  }

  const message = rec.message;
  if (!message || typeof message !== 'object') return;
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type !== 'tool_use') continue;
    const name = typeof b.name === 'string' ? b.name : '?';
    counts.toolCounts[name] = (counts.toolCounts[name] ?? 0) + 1;
  }
}

/**
 * Stream a JSONL session file line-by-line and accumulate counts.
 *
 * Throws on read errors so callers can surface them — silently swallowing
 * IO errors would return misleading "0 messages" stats and hide outages.
 */
async function countSessionFile(
  jsonlPath: string,
  lineRange?: [number, number],
): Promise<RawCounts> {
  const counts = blankCounts();

  let stream: ReadStream;
  try {
    stream = createReadStream(jsonlPath, { encoding: 'utf8' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown filesystem error';
    throw new Error(`Failed to open session file "${jsonlPath}": ${message}`, {
      cause: error,
    });
  }

  // Attach a stream 'error' handler so async errors (EACCES mid-read, EIO,
  // etc.) surface instead of crashing the process as unhandled errors.
  // Node will re-throw them through the async-iterator below, which is why
  // we still wrap the iteration in try/catch — but we also always
  // destroy() the stream in finally to release the file descriptor, since
  // rl.close() alone does not close the underlying FD.
  let streamError: Error | undefined;
  stream.on('error', (err: Error) => {
    streamError = err;
  });

  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  const start = lineRange ? Math.max(1, lineRange[0]) : 1;
  const end = lineRange ? lineRange[1] : Infinity;

  try {
    for await (const line of rl) {
      lineNumber++;
      if (lineNumber < start) continue;
      if (lineNumber > end) {
        rl.close();
        break;
      }
      counts.totalLines = lineNumber;
      processLine(counts, line);
    }
    if (streamError) {
      throw streamError;
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown filesystem error';
    throw new Error(`Failed to read session file "${jsonlPath}": ${message}`, {
      cause: error,
    });
  } finally {
    try {
      rl.close();
    } catch {
      // ignore
    }
    if (!stream.destroyed) {
      stream.destroy();
    }
  }

  return counts;
}

function bashFallbackRatio(toolCounts: Record<string, number>): number {
  const bash = toolCounts.Bash ?? 0;
  const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return Number((bash / total).toFixed(4));
}

function buildStats(file: SessionJsonl, counts: RawCounts): SessionStats {
  return {
    sessionId: file.sessionId,
    jsonlPath: file.jsonlPath,
    ...counts,
    bashFallbackRatio: bashFallbackRatio(counts.toolCounts),
  };
}

/**
 * Summarise tool-use counts and message metrics for a Claude Code session
 * transcript. Avoids manual JSONL parsing in inline Python — single MCP call
 * returns the same numbers an MCP gap audit would compute by hand.
 */
export async function sessionStats(
  params: SessionStatsParams,
): Promise<ToolResult> {
  const { sessionId, project, lineRange } = params;
  const includeSubagents = params.includeSubagents ?? false;

  let projectsDir: string;
  let projectSlug: string;
  try {
    projectsDir = findClaudeProjectsDir();
    projectSlug = resolveProjectSlug(projectsDir, project);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }

  const projectDir = `${projectsDir}/${projectSlug}`.replace(/\\/g, '/');
  const allFiles = listSessionJsonls(projectDir, { includeSubagents: true });

  // Resolve target parent session: explicit sessionId, or most recently
  // modified parent JSONL.
  const parents = allFiles.filter((f) => !f.isSubagent);
  parents.sort((a, b) => {
    if (a.lastModified === b.lastModified) return 0;
    return a.lastModified < b.lastModified ? 1 : -1;
  });

  let target: SessionJsonl | undefined;
  if (sessionId) {
    target = allFiles.find((f) => f.sessionId === sessionId && !f.isSubagent);
  } else {
    target = parents[0];
  }

  if (!target) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: sessionId
            ? `No parent session JSONL found for sessionId "${sessionId}" under ${projectDir}`
            : `No parent session JSONL files found under ${projectDir}`,
        },
      ],
    };
  }

  let parentCounts: RawCounts;
  try {
    parentCounts = await countSessionFile(target.jsonlPath, lineRange);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
  const parentStats = buildStats(target, parentCounts);

  if (includeSubagents) {
    // Only aggregate subagents that belong to the selected parent session —
    // their JSONL paths live under <projectDir>/<parent sessionId>/subagents/.
    const targetSubagentsDir = `/${target.sessionId}/subagents/`;
    const subagents = allFiles.filter(
      (f) =>
        f.isSubagent &&
        f.jsonlPath.replace(/\\/g, '/').includes(targetSubagentsDir),
    );
    const subagentStats: SessionStats[] = [];
    for (const sa of subagents) {
      let counts: RawCounts;
      try {
        counts = await countSessionFile(sa.jsonlPath, lineRange);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
      if (counts.totalMessages === 0) continue;
      subagentStats.push(buildStats(sa, counts));

      // Aggregate into parent totals — extend the timestamp window across
      // subagents so the returned firstMessageAt/lastMessageAt covers the
      // whole aggregated view.
      parentStats.totalMessages += counts.totalMessages;
      parentStats.totalLines += counts.totalLines;
      for (const [name, n] of Object.entries(counts.toolCounts)) {
        parentStats.toolCounts[name] = (parentStats.toolCounts[name] ?? 0) + n;
      }
      if (counts.firstMessageAt) {
        if (
          !parentStats.firstMessageAt ||
          counts.firstMessageAt < parentStats.firstMessageAt
        ) {
          parentStats.firstMessageAt = counts.firstMessageAt;
        }
      }
      if (counts.lastMessageAt) {
        if (
          !parentStats.lastMessageAt ||
          counts.lastMessageAt > parentStats.lastMessageAt
        ) {
          parentStats.lastMessageAt = counts.lastMessageAt;
        }
      }
    }
    parentStats.bashFallbackRatio = bashFallbackRatio(parentStats.toolCounts);
    parentStats.subagentStats = subagentStats;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ project: projectSlug, ...parentStats }, null, 2),
      },
    ],
  };
}
