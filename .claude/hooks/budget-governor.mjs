#!/usr/bin/env node
/**
 * PreToolUse hook (matcher ""): per-session tool-call budget governor.
 *
 * Long autonomous sessions that burn hundreds of tool calls without converging
 * are usually stuck (retry loops, polling, scope creep) and waste tokens and
 * wall-clock. This hook meters every tool call against a soft and a hard
 * budget:
 *
 *   count < SOFT                advisory-free zone (the remind-compact.sh
 *                               hook already handles cadence reminders)
 *   count >= SOFT               [BUDGET] advisory at the soft threshold and
 *                               every WARN_EVERY calls after — re-check scope,
 *                               checkpoint progress
 *   count >= HARD               non-checkpoint tools are BLOCKED (exit 2); the
 *                               agent is directed to checkpoint: commit, push,
 *                               update the PR/tasks, and summarise state.
 *                               Checkpoint-safe tools (git commit/push/status/
 *                               diff/log/rev-parse, git rebase|merge --abort,
 *                               worktree_*, github_*, jira_*, Atlassian MCP
 *                               tools, Task*, Skill, AskUserQuestion) stay
 *                               allowed so wrapping up — or safely bailing out
 *                               of a stuck rebase/merge — is always possible.
 *
 * Loop safety: after MAX_BLOCKS blocked calls the governor disarms itself for
 * the rest of the session (advisory only) — an agent is never trapped.
 * Bash bypass marker: `# budget-ok: <reason>` anywhere in the command.
 *
 * Config (env): LS_BUDGET_SOFT_CALLS (default 250), LS_BUDGET_HARD_CALLS
 * (default 500), LS_BUDGET_WARN_EVERY (default 50). Set LS_BUDGET_HARD_CALLS=0
 * to disable blocking entirely.
 *
 * State: <os-tmpdir>/claude-hooks/<session_id>/budget.json — per-session, so
 * concurrent sessions never share a meter. Audit: .claude/audit/budget-governor.jsonl.
 */

import { join } from 'path';
import {
  readHookInput,
  readJson,
  writeJson,
  appendJsonl,
  auditDir,
  sessionDir,
  truncate,
} from './lib/hook-utils.mjs';

function envInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

const SOFT = envInt('LS_BUDGET_SOFT_CALLS', 250);
const HARD = envInt('LS_BUDGET_HARD_CALLS', 500);
const WARN_EVERY = Math.max(1, envInt('LS_BUDGET_WARN_EVERY', 50));
const MAX_BLOCKS = 5;

const input = readHookInput();
if (!input?.tool_name) process.exit(0);

const tool = input.tool_name;
const stateFile = join(sessionDir(input), 'budget.json');
const state = readJson(stateFile, {
  count: 0,
  firstTs: Date.now(),
  blocks: 0,
  disarmed: false,
});
state.count += 1;

const elapsedMin = Math.round((Date.now() - state.firstTs) / 60000);

/** Tools that must stay available so the agent can always checkpoint and stop. */
function isCheckpointSafe() {
  if (
    /^(mcp__legacy-sports-github__|mcp__worktree__|mcp__legacy-sports-jira__|mcp__Atlassian__|TaskUpdate$|TaskCreate$|TaskGet$|TaskList$|Skill$|AskUserQuestion$|ExitPlanMode$)/.test(
      tool,
    )
  ) {
    return true;
  }
  if (tool === 'Bash') {
    const command = String(input.tool_input?.command ?? '');
    const firstLine = command.split('\n')[0];
    if (
      /^\s*git\s+(add|commit|push|status|diff|log|rev-parse)\b/.test(
        firstLine,
      ) ||
      /^\s*git\s+(rebase|merge)\s+--abort\b/.test(firstLine)
    )
      return true;
    // Scan the whole command (not just the first line) so a marker on a
    // trailing comment line still disarms the block for this call.
    if (/(^|[\s])#\s*budget-ok\b/.test(command)) return true;
  }
  return false;
}

let stdout = '';
let exitCode = 0;

if (HARD > 0 && state.count >= HARD && !state.disarmed && !isCheckpointSafe()) {
  state.blocks += 1;
  if (state.blocks > MAX_BLOCKS) {
    state.disarmed = true;
    stdout =
      `[BUDGET DISARMED] Hard budget enforcement bypassed after ${MAX_BLOCKS} blocked calls. ` +
      `This ${tool} call is what disarmed it. ` +
      `Continuing advisory-only — but this session (${state.count} calls, ~${elapsedMin} min) needs human review.\n`;
  } else {
    stdout =
      `[BUDGET EXCEEDED] ${state.count} tool calls — past the hard budget of ${HARD}.\n\n` +
      `This tool call is blocked. Checkpoint NOW instead of continuing:\n` +
      `  1. Commit and push whatever is complete (git commit/push/status/diff/log/rev-parse, ` +
      `git rebase/merge --abort, and worktree_*/github_*/jira_*/Atlassian MCP tools remain allowed).\n` +
      `  2. Update the PR and tracking tasks with honest state — done, remaining, blocked.\n` +
      `  3. Summarise where you are and stop; do not open new lines of work.\n\n` +
      `If ONE specific Bash call is essential to checkpointing, add \`# budget-ok: <reason>\` anywhere in the command.\n` +
      `(Block ${state.blocks} of ${MAX_BLOCKS} — after that the governor disarms and flags the session for review.)\n`;
    exitCode = 2;
  }
  appendJsonl(join(auditDir(input), 'budget-governor.jsonl'), {
    ts: new Date().toISOString(),
    sessionId: input.session_id,
    event: exitCode === 2 ? 'block' : 'disarm',
    count: state.count,
    elapsedMin,
    tool,
    arg: truncate(
      input.tool_input?.command ?? input.tool_input?.file_path ?? '',
      120,
    ),
  });
} else if (
  state.count === SOFT ||
  (state.count > SOFT && (state.count - SOFT) % WARN_EVERY === 0)
) {
  const hardNote =
    HARD > 0
      ? ` Hard stop at ${HARD} — non-checkpoint tools will be blocked.`
      : '';
  stdout =
    `[BUDGET] ${state.count} tool calls this session (~${elapsedMin} min, soft budget ${SOFT}).${hardNote}\n` +
    `Re-check scope: is this still the shortest path to a merged PR? Checkpoint durable progress ` +
    `(commit, push, update tasks) before starting anything new.\n`;
  appendJsonl(join(auditDir(input), 'budget-governor.jsonl'), {
    ts: new Date().toISOString(),
    sessionId: input.session_id,
    event: 'warn',
    count: state.count,
    elapsedMin,
  });
}

writeJson(stateFile, state);
// Advisory messages (exit 0) are injected via stdout; block messages (exit 2)
// are fed back via stderr.
if (stdout) (exitCode === 2 ? process.stderr : process.stdout).write(stdout);
process.exit(exitCode);
