import { execFile, execFileSync } from 'node:child_process';
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
 * Otherwise on Windows: `py` launcher first (installed to C:\Windows\ by the
 * Python installer, present on system PATH even when the user PATH is stripped
 * in MCP server processes), then `python3`/`python` for non-launcher installs,
 * then common absolute paths for Program Files / AppData installs.
 * On Linux/macOS: shell-discovered paths first (via `which`) so the MCP server
 * finds the same interpreter the user shell sees even when the server process
 * inherits a stripped PATH, followed by `python3`/`python` and common absolute
 * paths as fallbacks.
 */
export function pythonInterpreterCandidates(): string[] {
  if (process.env.PYTHON) return [process.env.PYTHON];
  if (process.platform === 'win32') {
    return [
      'py',
      'python3',
      'python',
      'C:\\Windows\\py.exe',
      `${process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local'}\\Programs\\Python\\Python313\\python.exe`,
      `${process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local'}\\Programs\\Python\\Python312\\python.exe`,
      `${process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local'}\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local'}\\Programs\\Python\\Python310\\python.exe`,
      'C:\\Program Files\\Python313\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
    ];
  }
  // Probe the shell's PATH via `which` first — resolves paths that the MCP
  // server process can't see because it inherits a stripped PATH environment.
  const shellDiscovered = discoverPythonViaShell();
  const fixed = [
    'python3',
    'python',
    '/usr/local/bin/python3',
    '/usr/local/bin/python',
    '/usr/bin/python3',
    '/usr/bin/python',
  ];
  // Prepend shell-discovered paths; deduplicate against the fixed list.
  const seen = new Set(fixed);
  return [...shellDiscovered.filter((p) => !seen.has(p)), ...fixed];
}

/**
 * Ask the user shell where Python lives. Returns absolute paths that `which`
 * resolves from the shell's own PATH — the MCP server process may have a
 * stripped PATH that omits directories the user shell includes.
 * Never throws; returns an empty array if `which` is unavailable or finds nothing.
 */
function discoverPythonViaShell(): string[] {
  const discovered: string[] = [];
  for (const name of ['python3', 'python']) {
    try {
      const found = execFileSync('which', [name], {
        encoding: 'utf8',
        timeout: 2_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (found) discovered.push(found);
    } catch {
      // `which` not on PATH or interpreter not found — skip silently
    }
  }
  return discovered;
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
