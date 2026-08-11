import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  type BashCall,
  extractBashCalls,
  extractMcpCalls,
  extractScratchSubprocessCalls,
  findLatestSession,
  findSessionByPid,
  formatAudit,
  formatGapsOnly,
  type McpIssue,
  type ScratchCall,
} from './audit-session-bash-parse.js';
import { getRepoRoot } from '../github-api.js';
import { findClaudeProjectsDir, resolveProjectSlug } from '../session-files.js';
import type { ToolResult } from '../types.js';

/**
 * Strict allow-list for project slug basenames. Mirrors assertSafeSlug in session-files.ts.
 * Rejects absolute paths, path separators, "..", and any character outside [A-Za-z0-9._-].
 */
const SAFE_SLUG_RE = /^[A-Za-z0-9._-]+$/;

function validateProjectSlug(slug: string): string | null {
  // basename() strips path separators; if the result differs from the input,
  // the caller smuggled in a directory component (e.g. "../foo", "/abs/path").
  const safe = basename(slug);
  if (
    !safe ||
    safe === '.' ||
    safe === '..' ||
    safe !== slug ||
    !SAFE_SLUG_RE.test(safe)
  ) {
    return null;
  }
  return safe;
}

export interface AuditSessionBashParams {
  sessionId?: string;
  project?: string;
  projectsDir?: string;
  includeMcp?: boolean;
  pid?: number;
  gapsOnly?: boolean;
  scanScratch?: boolean;
  auditMode?: boolean;
}

function textError(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Extract Bash tool_use calls (and optionally MCP overflows/failures) from a
 * Claude Code session transcript.
 *
 * Node-native implementation (LS-8316): session JSONL discovery comes from
 * session-files.ts and the parsing/classification/formatting logic lives in
 * audit-session-bash-parse.ts — a 1:1 TypeScript port of the retired
 * scripts/audit-session-bash.py. No external interpreter is involved, so the
 * tool works identically on local Windows (with or without Python), cloud
 * Linux containers with no Python at all, and hosted server environments
 * where the server process PATH differs from the user shell PATH.
 *
 * Output modes match the Python script's:
 *   - default: structured JSON report with full command details
 *   - gapsOnly: compact plain-text frequency table
 *   - auditMode: structured JSON audit report with pre-classified gaps
 */
export function auditSessionBash(params: AuditSessionBashParams): ToolResult {
  let projectsDir: string;
  try {
    projectsDir = findClaudeProjectsDir(params.projectsDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textError(`audit-session-bash failed: ${message}`);
  }

  let projectSlug: string;
  if (params.project) {
    const safe = validateProjectSlug(params.project);
    if (!safe) {
      return textError(
        `Invalid project slug: ${JSON.stringify(params.project)}. ` +
          'Must match /^[A-Za-z0-9._-]+$/ with no path separators or ".." components.',
      );
    }
    projectSlug = safe;
  } else {
    try {
      projectSlug = resolveProjectSlug(projectsDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return textError(`audit-session-bash failed: ${message}`);
    }
  }

  const projectDir = join(projectsDir, projectSlug);
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    return textError(`Error: project directory not found: ${projectDir}`);
  }

  // Resolve session ID: explicit param > PID lookup > most recent JSONL.
  let sessionId = params.sessionId;
  if (!sessionId && params.pid !== undefined) {
    const fromPid = findSessionByPid(params.pid);
    if (!fromPid) {
      return textError(`Error: no session found for PID ${params.pid}`);
    }
    sessionId = fromPid;
  }
  if (!sessionId) {
    try {
      sessionId = findLatestSession(projectDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return textError(message);
    }
  }

  // auditMode implies includeMcp
  const includeMcp = Boolean(params.includeMcp || params.auditMode);

  // Parse parent JSONL
  const parentJsonl = join(projectDir, `${sessionId}.jsonl`);
  const bashCalls: BashCall[] = extractBashCalls(parentJsonl, 'parent');
  const mcpIssues: McpIssue[] = includeMcp
    ? extractMcpCalls(parentJsonl, 'parent')
    : [];

  // Parse subagent JSONLs
  const subagentDir = join(projectDir, sessionId, 'subagents');
  if (existsSync(subagentDir) && statSync(subagentDir).isDirectory()) {
    const subagentFiles = readdirSync(subagentDir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
    for (const saFile of subagentFiles) {
      const sourceName = saFile.replace(/\.jsonl$/, '');
      const saPath = join(subagentDir, saFile);
      bashCalls.push(...extractBashCalls(saPath, sourceName));
      if (includeMcp) {
        mcpIssues.push(...extractMcpCalls(saPath, sourceName));
      }
    }
  }

  // Sort all by timestamp (Array.prototype.sort is stable, matching Python)
  bashCalls.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  mcpIssues.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );

  // Scan scratch/*.py for subprocess calls if requested
  const scratchCalls: ScratchCall[] | null = params.scanScratch
    ? extractScratchSubprocessCalls(getRepoRoot())
    : null;

  if (params.auditMode) {
    return {
      content: [
        {
          type: 'text',
          text: formatAudit(bashCalls, mcpIssues, sessionId, scratchCalls),
        },
      ],
    };
  }

  if (params.gapsOnly) {
    // gaps-only returns plain text, not JSON
    return {
      content: [
        {
          type: 'text',
          text: formatGapsOnly(bashCalls, sessionId, scratchCalls).trim(),
        },
      ],
    };
  }

  const output: Record<string, unknown> = {
    session_id: sessionId,
    project: projectSlug,
    bash_commands: bashCalls,
    total: bashCalls.length,
  };
  if (includeMcp) {
    output['mcp_issues'] = mcpIssues;
  }
  if (scratchCalls !== null) {
    output['scratch_subprocess_calls'] = scratchCalls;
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}
