#!/usr/bin/env node
/**
 * Stop hook: delivery gate — no "done" without proof.
 *
 * Blocks the stop when this session EDITED product source files but the
 * evidence ledger (log-tool-evidence.mjs) contains NO successful validation
 * run. Catches the classic agent failure mode of editing code, narrating
 * "done ✅", and stopping without ever running typecheck/lint/tests.
 *
 * What counts as a source edit: Edit/Write/NotebookEdit on any path that is
 * not documentation or agent-config (docs/, scratch/, .claude/, .agents/,
 * editor config dirs, *.md, *.txt).
 *
 * What counts as validation evidence (must not have failed):
 *   - nx_run_pc_chunk / nx_run_affected / nx_run / nx_run_e2e_specs MCP calls
 *   - make_run with a pc-*, test, lint, typecheck, or build target
 *   - Bash: make pc-* / make test / make build, pnpm test|lint|typecheck|build,
 *     pnpm exec nx|vitest|jest|playwright|tsc|eslint, npx equivalents,
 *     make sync-agent-prompts / lint-agent-prompts
 *   - ci_wait_run (waited on a real CI result)
 *
 * Loop safety (same pattern as check-incomplete-work.sh): blocks at most
 * MAX_BLOCKS times per session, then bypasses with a loud warning. Counter is
 * per-session (no cross-session staleness issues).
 *
 * Exit 0 = allow stop. Exit 2 + stderr = block stop; the stderr message is
 * fed back to the agent as follow-up input.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import {
  readHookInput,
  readJsonl,
  bumpCounter,
  sessionDir,
} from './lib/hook-utils.mjs';

const MAX_BLOCKS = 2;

const input = readHookInput();
if (!input) process.exit(0);

const dir = sessionDir(input);
const evidence = readJsonl(join(dir, 'evidence.jsonl'));
if (evidence.length === 0) process.exit(0); // no ledger — fail open

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const tmpPrefix = tmpdir().replace(/\\/g, '/');
const EXEMPT_PATH = [
  // OS temp dir (scratch scripts, task output) is never a deliverable
  new RegExp(`^${tmpPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
  /^\/tmp\//,
  /\.(md|mdx|txt)$/i,
  /(^|[/\\])docs[/\\]/,
  /(^|[/\\])scratch[/\\]/,
  /(^|[/\\])\.claude[/\\]/,
  /(^|[/\\])\.agents[/\\]/,
  /(^|[/\\])\.(vscode|cursor|codex|opencode|idea)[/\\]/,
  /(^|[/\\])\.github[/\\](prompts|instructions)[/\\]/, // generated mirrors
  /\.gitignore$/,
];

const sourceEdits = [
  ...new Set(
    evidence
      .filter((e) => EDIT_TOOLS.has(e.tool) && e.ok !== false && e.arg)
      .map((e) => e.arg.replace(/\\/g, '/'))
      .filter((path) => !EXEMPT_PATH.some((re) => re.test(path))),
  ),
];

if (sourceEdits.length === 0) process.exit(0);

const BASH_VALIDATION =
  /\bmake\s+(pc-\w+|test\b|build\b|(sync|lint)-agent-prompts)|\bpnpm\s+(run\s+)?(test|lint|typecheck|build)\b|\bpnpm\s+exec\s+(nx|vitest|jest|playwright|tsc|eslint)\b|\bnpx\s+(vitest|jest|playwright|tsc|eslint)\b/;

const hasValidation = evidence.some((e) => {
  if (e.ok === false) return false;
  if (
    /__(nx_run_pc_chunk|nx_run_affected|nx_run_e2e_specs|nx_run)$/.test(e.tool)
  )
    return true;
  if (
    /__make_run$/.test(e.tool) &&
    /(^|\s)(pc-\w+|test|lint|typecheck|build)/.test(e.arg ?? '')
  )
    return true;
  if (/__ci_wait_run$/.test(e.tool)) return true;
  if (e.tool === 'Bash' && BASH_VALIDATION.test(e.arg ?? '')) return true;
  return false;
});

if (hasValidation) process.exit(0);

// --- Block (with max-block bypass to avoid infinite stop loops) ---
const blockCount = bumpCounter(join(dir, 'delivery-gate-blocks'));
const fileList = sourceEdits
  .slice(0, 10)
  .map((f) => `    ${f}`)
  .join('\n');
const more =
  sourceEdits.length > 10 ? `\n    …and ${sourceEdits.length - 10} more` : '';

if (blockCount > MAX_BLOCKS) {
  process.stdout.write(
    `\n⚠️  DELIVERY GATE BYPASSED — blocked ${blockCount - 1} time(s), allowing stop.\n` +
      `  Source files were edited this session with no recorded validation run:\n${fileList}${more}\n` +
      `  Human review required — treat any "done" claim from this session as UNVERIFIED.\n\n`,
  );
  process.exit(0);
}

// Block messages go to stderr — on exit 2 Claude Code feeds stderr (not stdout)
// back to the agent.
process.stderr.write(
  `\n⛔ STOP BLOCKED — delivery gate: code changed, but no validation evidence\n\n` +
    `  This session edited source files:\n${fileList}${more}\n\n` +
    `  The evidence ledger contains no successful typecheck/lint/test/build run,\n` +
    `  so the work cannot be reported as done. Before stopping:\n` +
    `    1. Run the relevant validation — nx_run_pc_chunk({ chunk: "pc-typecheck" }),\n` +
    `       then pc-lint and pc-test (or Bash \`make pc-<chunk>\` with run_in_background: true).\n` +
    `    2. Report the ACTUAL results — if validation fails, say so and fix it;\n` +
    `       never claim completion without proof.\n` +
    `  (Attempt ${blockCount} of ${MAX_BLOCKS} — auto-bypasses after that, flagged for human review.)\n\n`,
);
process.exit(2);
