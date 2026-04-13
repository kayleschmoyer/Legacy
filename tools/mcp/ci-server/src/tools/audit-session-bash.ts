import { execFile } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { getRepoRoot } from '../github-api.js';
import type { ToolResult } from '../types.js';

export interface AuditSessionBashParams {
  sessionId?: string;
  project?: string;
  includeMcp?: boolean;
  pid?: number;
  gapsOnly?: boolean;
  scanScratch?: boolean;
  auditMode?: boolean;
}

/** Resolve the Python interpreter: prefer python3, fall back to python / py (Windows). */
function resolvePythonInterpreter(): string {
  if (process.platform === 'win32') {
    // On Windows, 'py -3' is the canonical launcher, but execFile needs a single command.
    // Use PYTHON env override if set; otherwise fall back to 'python3' then 'python'.
    return process.env.PYTHON ?? 'python3';
  }
  return process.env.PYTHON ?? 'python3';
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
  const python = resolvePythonInterpreter();

  const args = [scriptPath];
  if (params.auditMode) {
    args.push('--audit');
  } else if (params.gapsOnly) {
    args.push('--gaps-only');
  } else {
    args.push('--format', 'json');
  }
  if (params.sessionId) args.push('--session-id', params.sessionId);
  if (params.project) args.push('--project', params.project);
  if (params.includeMcp) args.push('--include-mcp');
  if (params.pid !== undefined) args.push('--pid', String(params.pid));
  if (params.scanScratch) args.push('--scan-scratch');

  const tryExec = (interpreter: string): Promise<ToolResult> =>
    new Promise((done) => {
      execFile(
        interpreter,
        args,
        { cwd: repoRoot, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            done({
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `audit-session-bash failed (interpreter: ${interpreter}): ${stderr.trim() || err.message}`,
                },
              ],
            });
            return;
          }
          if (params.gapsOnly && !params.auditMode) {
            // --gaps-only returns plain text, not JSON
            done({ content: [{ type: 'text', text: stdout.trim() }] });
            return;
          }
          try {
            const data: unknown = JSON.parse(stdout.trim());
            done({
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            });
          } catch {
            const preview = stdout.slice(0, 500);
            const truncated = stdout.length > 500 ? '... (truncated)' : '';
            done({
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Failed to parse JSON output from audit-session-bash.py:\n${preview}${truncated}`,
                },
              ],
            });
          }
        },
      );
    });

  const result = await tryExec(python);
  // If python3 failed (e.g. not found on PATH), retry with 'python' as fallback
  if (
    result.isError === true &&
    python === 'python3' &&
    typeof result.content[0]?.text === 'string' &&
    result.content[0].text.includes('ENOENT')
  ) {
    return tryExec('python');
  }
  return result;
}
