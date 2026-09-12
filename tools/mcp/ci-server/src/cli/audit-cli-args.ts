/**
 * Argument parsing for the local `audit-session-bash` CLI (LS-8890).
 *
 * Kept separate from the runnable entry (`audit-session-bash-cli.ts`) so the
 * parsing is unit-testable without `import.meta.url`, an ESM-only construct
 * the CommonJS test runner cannot load — same split as the db-admin server's
 * `migrate-client.ts` / `migrate-cli.ts` pair.
 */

import type { AuditSessionBashParams } from '../tools/audit-session-bash.js';

const BOOLEAN_FLAGS = [
  'auditMode',
  'gapsOnly',
  'includeMcp',
  'scanScratch',
] as const;

const STRING_FLAGS = ['sessionId', 'project', 'projectsDir'] as const;

export const AUDIT_CLI_USAGE = `Usage: audit-session-bash [options]

Runs the same audit as the ci_audit_session_bash MCP tool, in this process
(and therefore this user/mount namespace), for environments where the MCP
server process cannot read the session transcript (LS-8890).

Options:
  --auditMode              Full pre-classified gap report (implies --includeMcp)
  --gapsOnly               Compact one-line-per-pattern frequency table
  --includeMcp             Include MCP overflows and failures
  --scanScratch            Also scan scratch/*.py for subprocess shell patterns
  --sessionId <uuid>       Session UUID (default: most recent transcript)
  --project <slug>         Project slug (default: derived from CWD)
  --projectsDir <path>     Base directory holding project session folders
  --pid <n>                Resolve the session ID from a process ID
  --sessionToolNames <a,b> Comma-separated tool names visible to your session
  -h, --help               Show this message`;

export class AuditCliArgsError extends Error {}

/**
 * Parse `process.argv.slice(2)` into `auditSessionBash` params.
 *
 * Accepts both `--flag value` and `--flag=value` spellings. Unknown flags and
 * missing values are hard errors rather than silent no-ops: a typo'd flag in
 * this fallback path would otherwise produce a confusingly empty audit.
 */
export function parseAuditCliArgs(argv: string[]): AuditSessionBashParams {
  const params: AuditSessionBashParams = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      throw new AuditCliArgsError(AUDIT_CLI_USAGE);
    }
    if (!arg.startsWith('--')) {
      throw new AuditCliArgsError(`Unexpected argument: ${arg}`);
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    const readValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new AuditCliArgsError(`Missing value for --${name}`);
      }
      i++;
      return next;
    };

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      // `--auditMode=false` is honored; a bare `--auditMode` means true.
      const value = inlineValue === undefined ? 'true' : inlineValue;
      params[name as (typeof BOOLEAN_FLAGS)[number]] = value !== 'false';
      continue;
    }

    if ((STRING_FLAGS as readonly string[]).includes(name)) {
      params[name as (typeof STRING_FLAGS)[number]] = readValue();
      continue;
    }

    if (name === 'pid') {
      const raw = readValue();
      const pid = Number(raw);
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new AuditCliArgsError(`--pid must be a positive integer: ${raw}`);
      }
      params.pid = pid;
      continue;
    }

    if (name === 'sessionToolNames') {
      params.sessionToolNames = readValue()
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      continue;
    }

    throw new AuditCliArgsError(`Unknown option: --${name}`);
  }

  return params;
}
