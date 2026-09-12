#!/usr/bin/env tsx
/**
 * Runnable entry for `ci_audit_session_bash`, for environments where the MCP
 * server process cannot read the session transcript at all (LS-8890, and its
 * duplicates LS-9196 / LS-9200).
 *
 * In Claude Code Remote (CCR) the ci MCP server runs in a different
 * container/user namespace than the agent: the transcript is real and
 * readable by the agent's own Bash tool (e.g. root-owned, mode 0700, under
 * /root/.claude/projects/<slug>/), but no path the agent can name is visible
 * to the server, so neither auto-detection nor an explicit `projectsDir`
 * override can ever succeed (LS-8867 / LS-9268 / LS-9458 / LS-9538 each
 * narrowed the path search and confirmed this). The transcript can only reach
 * the server over the MCP protocol itself (`transcriptContent`), which costs
 * the whole transcript in context.
 *
 * This entry sidesteps both: it is the same `auditSessionBash` implementation,
 * executed in the agent's own namespace, so it reads the transcript directly
 * and prints the identical report. No logic is duplicated — only the process
 * boundary changes.
 *
 * Run: `node --import tsx tools/mcp/ci-server/src/cli/audit-session-bash-cli.ts --auditMode`
 */

import { fileURLToPath } from 'node:url';
import { AuditCliArgsError, parseAuditCliArgs } from './audit-cli-args.js';
import { auditSessionBash } from '../tools/audit-session-bash.js';

/**
 * Returns the process exit code: 0 on a successful audit, 1 when the audit
 * itself reported an error (e.g. the transcript is genuinely absent).
 *
 * Writes to stdout/stderr directly rather than via LOGGER: the report is
 * machine-consumed output meant to be piped or read verbatim, and LOGGER's
 * structured envelope would corrupt it.
 */
export function runAuditCli(
  argv: string[],
  stdout: (text: string) => void,
  stderr: (text: string) => void,
): number {
  let params;
  try {
    params = parseAuditCliArgs(argv);
  } catch (err) {
    if (err instanceof AuditCliArgsError) {
      stderr(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const result = auditSessionBash(params);
  const text = result.content.map((c) => c.text).join('\n');

  if (result.isError) {
    stderr(`${text}\n`);
    return 1;
  }
  stdout(`${text}\n`);
  return 0;
}

// Run only when executed directly (via tsx), never when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runAuditCli(
    process.argv.slice(2),
    (text) => process.stdout.write(text),
    (text) => process.stderr.write(text),
  );
}
