import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  findClaudeProjectsDir,
  listSessionJsonls,
  resolveProjectSlug,
  type SessionJsonl,
} from '../session-files.js';
import type { ToolResult } from '../types.js';

export interface FindSessionParams {
  query: string;
  project?: string;
  includeSubagents?: boolean;
  limit?: number;
}

export interface FindSessionMatch {
  sessionId: string;
  jsonlPath: string;
  isSubagent: boolean;
  firstMatchLine: number;
  matchCount: number;
  lastModified: string;
}

interface FileMatchSummary {
  firstMatchLine: number;
  matchCount: number;
}

/** Stream a JSONL file line-by-line and count substring matches. */
async function scanFile(
  jsonlPath: string,
  query: string,
): Promise<FileMatchSummary | null> {
  let stream;
  try {
    stream = createReadStream(jsonlPath, { encoding: 'utf8' });
  } catch {
    return null;
  }

  return new Promise((resolvePromise) => {
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let firstMatchLine = 0;
    let matchCount = 0;
    let lineNumber = 0;

    rl.on('line', (line) => {
      lineNumber++;
      if (line.includes(query)) {
        if (firstMatchLine === 0) firstMatchLine = lineNumber;
        matchCount++;
      }
    });

    rl.on('close', () => {
      if (matchCount === 0) {
        resolvePromise(null);
      } else {
        resolvePromise({ firstMatchLine, matchCount });
      }
    });

    rl.on('error', () => {
      resolvePromise(null);
    });
  });
}

/**
 * Search every JSONL session file under a project directory for a substring,
 * returning sessions ranked by lastModified descending. Used by agents to
 * locate "where did I work on LS-XXXX earlier today?" without manually
 * grepping ~/.claude/projects/.
 */
export async function findSession(
  params: FindSessionParams,
): Promise<ToolResult> {
  const { query } = params;
  if (!query || !query.trim()) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'find-session requires a non-empty query string',
        },
      ],
    };
  }

  let projectsDir: string;
  let projectSlug: string;
  try {
    projectsDir = findClaudeProjectsDir();
    projectSlug = resolveProjectSlug(projectsDir, params.project);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }

  const projectDir = `${projectsDir}/${projectSlug}`.replace(/\\/g, '/');
  const includeSubagents = params.includeSubagents ?? true;
  const limit = params.limit ?? 50;
  const files: SessionJsonl[] = listSessionJsonls(projectDir, {
    includeSubagents,
  });

  const matches: FindSessionMatch[] = [];
  for (const file of files) {
    const summary = await scanFile(file.jsonlPath, query);
    if (!summary) continue;

    matches.push({
      sessionId: file.sessionId,
      jsonlPath: file.jsonlPath,
      isSubagent: file.isSubagent,
      firstMatchLine: summary.firstMatchLine,
      matchCount: summary.matchCount,
      lastModified: file.lastModified,
    });
  }

  matches.sort((a, b) => {
    if (a.lastModified === b.lastModified) return 0;
    return a.lastModified < b.lastModified ? 1 : -1;
  });

  const totalMatched = matches.length;
  const truncated = totalMatched > limit;
  const returnedMatches = truncated ? matches.slice(0, limit) : matches;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            project: projectSlug,
            query,
            total: totalMatched,
            returned: returnedMatches.length,
            truncated,
            matches: returnedMatches,
          },
          null,
          2,
        ),
      },
    ],
  };
}
