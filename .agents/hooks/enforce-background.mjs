#!/usr/bin/env node
/**
 * PreToolUse hook: block long-running nx/make commands that don't use run_in_background: true.
 *
 * These commands exceed the Bash tool's ~120s timeout when run inline, producing
 * "Tool execution was interrupted" in cloud agent sessions — which causes agents
 * to poll task output files, spin in retry loops, and stall.
 *
 * Matched patterns (when run_in_background is not true):
 *   pnpm exec nx affected/run-many/run-affected   — batch nx operations via pnpm
 *   nx affected ...      — bare nx affected calls
 *   nx run-many ...      — bare nx run-many calls
 *   make pc-<chunk>      — individual pc-validation chunks (e.g. make pc-typecheck)
 *
 * Bypass: add `# bg-ok` anywhere in the command to suppress this block when you
 * have confirmed inline execution is safe (e.g. a quick nx show project call).
 * For pc-validation, prefer nx_run_pc_chunk MCP tool instead — it has a 5-minute
 * timeout and returns structured pass/fail results.
 *
 * Always writes to stdout (shown in agent context). Exits 2 to block the tool call.
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

if (data?.tool_name !== 'Bash') process.exit(0);

const command = data?.tool_input?.command ?? '';
const runInBackground = data?.tool_input?.run_in_background === true;

if (!command) process.exit(0);
if (runInBackground) process.exit(0);

// Only scan the first line of the command. Heredoc bodies (git commit -m, etc.)
// start on subsequent lines and may legitimately mention nx without executing it.
const firstLine = command.split('\n')[0];

// Bypass: agent has confirmed inline execution is safe
if (/(?:^|[\s])#\s*bg-ok/.test(firstLine)) process.exit(0);

// Patterns known to run longer than the ~120s Bash tool timeout.
// Only the batch operations (affected, run-many) are blocked, not quick nx queries
// like `nx show project` or `nx list`.
const LONG_RUNNING =
  /pnpm\s+exec\s+nx\s+(affected|run-many|run-affected)\b|(?:^|[;&|\s])nx\s+(affected|run-many)\b|make\s+pc-\w+/;

if (!LONG_RUNNING.test(firstLine)) process.exit(0);

const snippet = firstLine.trim().slice(0, 150);

process.stdout.write(
  `[BACKGROUND REQUIRED] This command exceeds the Bash tool's ~120s timeout when run inline.\n` +
    `It will be killed mid-run, causing stalls and output-polling loops.\n\n` +
    `Options:\n` +
    `  1. Use nx MCP tools (preferred — structured results, 5-min timeout):\n` +
    `       nx_run_pc_chunk({ chunk: "pc-typecheck" })   ← pc-validation chunks\n` +
    `       nx_run_affected({ target: "test" })          ← affected tests\n` +
    `       nx_run_affected({ target: "lint" })          ← affected lint\n` +
    `  2. Resubmit with run_in_background: true and wait for the push notification.\n\n` +
    `Blocked command: ${snippet}\n\n` +
    `If inline execution is genuinely safe here, add \`# bg-ok\` to the command.\n`,
);

process.exit(2);
