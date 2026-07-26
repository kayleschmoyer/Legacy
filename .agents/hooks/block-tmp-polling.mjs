#!/usr/bin/env node
/**
 * PreToolUse hook: block Read calls targeting /tmp/claude* task output files.
 *
 * When agents run background Bash tasks, Claude Code writes their output to
 * temporary files under /tmp/claude-<id>/. Reading these files while the task is
 * still running returns partial output — agents then mis-reason about results,
 * re-check repeatedly, and stall in polling loops.
 *
 * The fix is to wait for the push notification that signals task completion
 * rather than reading intermediate output. This hook enforces that contract.
 *
 * Allowlisted (LS-8377 / LS-8389 — paths the harness itself directs agents to Read):
 *  - Background-task output files (tasks/<id>.output): the Bash and TaskOutput
 *    tool docs both say to Read these directly.
 *  - The session's designated scratchpad directory (.../scratchpad/): the system
 *    prompt designates it for temporary files agents write and read back.
 *
 * Exits 2 to block the Read call.
 */

import { readFileSync } from 'fs';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(input);
} catch {
  process.exit(0);
}

if (data?.tool_name !== 'Read') process.exit(0);

const filePath = data?.tool_input?.file_path ?? '';
if (!filePath) process.exit(0);

// Match /tmp/claude* paths (Unix) and Windows temp equivalents
const TMP_CLAUDE = /[/\\]tmp[/\\]claude|[/\\]Temp[/\\]claude/i;

if (!TMP_CLAUDE.test(filePath)) process.exit(0);

// Allowlist: paths under /tmp/claude* the harness explicitly tells agents to Read.
const ALLOWED = [
  // Harness background-task output files — Bash/TaskOutput docs direct agents
  // to Read them directly (LS-8377)
  /[/\\]tasks[/\\][^/\\]+\.output$/i,
  // The session's designated scratchpad directory (LS-8389)
  /[/\\]scratchpad([/\\]|$)/i,
];

if (ALLOWED.some((pattern) => pattern.test(filePath))) process.exit(0);

process.stdout.write(
  `[POLLING BLOCKED] Do not poll harness-internal files under /tmp/claude*.\n\n` +
    `Reading ${filePath} returns partial output that causes agents to\n` +
    `loop waiting for more data, stalling mid-validation.\n\n` +
    `Instead: wait for the push notification that fires when the background\n` +
    `task completes. It will surface the full result without polling.\n\n` +
    `Allowed paths: a background task's tasks/<id>.output file and the\n` +
    `session's designated scratchpad directory — this path is neither.\n` +
    `If you need to check on a running task, use TaskGet({ taskId }) to read\n` +
    `its current status — not the raw output file.\n`,
);

process.exit(2);
