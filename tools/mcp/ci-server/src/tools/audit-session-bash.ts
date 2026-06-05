import { execFile } from 'node:child_process';
import { basename, resolve as resolvePath } from 'node:path';
import { getRepoRoot } from '../github-api.js';
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
  includeMcp?: boolean;
  pid?: number;
  gapsOnly?: boolean;
  scanScratch?: boolean;
  auditMode?: boolean;
}

/**
 * Ordered list of Python interpreter candidates to try.
 * If the `PYTHON` env var is set, it is used as the sole candidate.
 * Otherwise: `python3` → `python`, plus common absolute paths for Linux/cloud
 * environments where the MCP server's spawned process may not inherit the full
 * shell PATH (e.g. Claude Code web sessions on Ubuntu), plus `py` on Windows.
 */
export function pythonInterpreterCandidates(): string[] {
  if (process.env.PYTHON) return [process.env.PYTHON];
  if (process.platform === 'win32') return ['python3', 'python', 'py'];
  return [
    'python3',
    'python',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    '/usr/bin/python',
  ];
}

/**
 * Run scripts/audit-session-bash.py and return its output.
 * When gapsOnly is true, passes --gaps-only and returns compact text.
 * Otherwise passes --format json and returns structured JSON.
 */
export async function auditSessionBash(
  params: AuditSessionBashParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const scriptPath = resolvePath(repoRoot, 'scripts', 'audit-session-bash.py');
  const interpreters = pythonInterpreterCandidates();

  const args = [scriptPath];
  if (params.auditMode) {
    args.push('--audit');
  } else if (params.gapsOnly) {
    args.push('--gaps-only');
  } else {
    args.push('--format', 'json');
  }
  if (params.sessionId) args.push('--session-id', params.sessionId);
  if (params.project) {
    const safe = validateProjectSlug(params.project);
    if (!safe) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `Invalid project slug: ${JSON.stringify(params.project)}. ` +
              'Must match /^[A-Za-z0-9._-]+$/ with no path separators or ".." components.',
          },
        ],
      };
    }
    args.push('--project', safe);
  }
  if (params.includeMcp) args.push('--include-mcp');
  if (params.pid !== undefined) args.push('--pid', String(params.pid));
  if (params.scanScratch) args.push('--scan-scratch');

  interface ExecOutcome {
    result: ToolResult;
    notFound: boolean;
  }

  const tryExec = (interpreter: string): Promise<ExecOutcome> =>
    new Promise((done) => {
      execFile(
        interpreter,
        args,
        { cwd: repoRoot, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const errCode = (err as NodeJS.ErrnoException).code;
            const notFound =
              errCode === 'ENOENT' ||
              (stderr ?? '').includes('ENOENT') ||
              err.message.includes('ENOENT');
            done({
              notFound,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `audit-session-bash failed (interpreter: ${interpreter}): ${stderr.trim() || err.message}`,
                  },
                ],
              },
            });
            return;
          }
          if (params.gapsOnly && !params.auditMode) {
            // --gaps-only returns plain text, not JSON
            done({
              notFound: false,
              result: { content: [{ type: 'text', text: stdout.trim() }] },
            });
            return;
          }
          try {
            const data: unknown = JSON.parse(stdout.trim());
            done({
              notFound: false,
              result: {
                content: [
                  { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
              },
            });
          } catch {
            const preview = stdout.slice(0, 500);
            const truncated = stdout.length > 500 ? '... (truncated)' : '';
            done({
              notFound: false,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Failed to parse JSON output from audit-session-bash.py:\n${preview}${truncated}`,
                  },
                ],
              },
            });
          }
        },
      );
    });

  for (const interpreter of interpreters) {
    const outcome = await tryExec(interpreter);
    if (!outcome.notFound) return outcome.result;
  }
  // All candidates failed with ENOENT — no Python found on PATH.
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `audit-session-bash failed: no Python interpreter found on PATH. Tried: ${interpreters.join(', ')}. Set the PYTHON env var to a valid interpreter path.`,
      },
    ],
  };
}
