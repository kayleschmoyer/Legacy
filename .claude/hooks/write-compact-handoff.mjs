#!/usr/bin/env node
/**
 * PreCompact hook: write a handoff snapshot immediately before compaction.
 *
 * Compaction summarises the conversation lossily — precise state (exact branch,
 * dirty files, what was validated, what is still in flight) is the first thing
 * to degrade. This hook freezes that state into a markdown file; the paired
 * SessionStart hook (read-compact-handoff.mjs, matcher "compact") injects it
 * back into context right after compaction so the agent resumes from facts,
 * not from a summary of facts.
 *
 * Snapshot contents: git branch / upstream ahead-behind / dirty files, recent
 * commits, and the tail of the session evidence ledger (log-tool-evidence.mjs).
 *
 * Storage: <os-tmpdir>/claude-hooks/<session_id>/handoff.md, plus a
 * last-handoff.txt pointer used as a fallback when the session id changes
 * across the compact boundary. Always exits 0.
 */

import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  readHookInput,
  readJsonl,
  git,
  projectDir,
  sessionDir,
  truncate,
} from './lib/hook-utils.mjs';

const input = readHookInput();
if (!input) process.exit(0);

const dir = sessionDir(input);

// --- Git state (each call fails soft to '') ---
const branch = git(input, ['rev-parse', '--abbrev-ref', 'HEAD']);
const statusLines = git(input, ['status', '--porcelain'])
  .split('\n')
  .filter(Boolean);
const commits = git(input, ['log', '--oneline', '-5']);
const aheadBehind = git(input, [
  'rev-list',
  '--left-right',
  '--count',
  '@{u}...HEAD',
]);
let upstream = 'no upstream';
if (aheadBehind) {
  const [behind, ahead] = aheadBehind.split(/\s+/);
  upstream = `${ahead ?? '?'} ahead / ${behind ?? '?'} behind upstream`;
}

// --- Evidence tail ---
const evidence = readJsonl(join(dir, 'evidence.jsonl'));
const tail = evidence
  .slice(-25)
  .map(
    (e) =>
      `- ${e.ok === false ? '❌' : '✓'} ${e.tool}: ${truncate(e.arg, 110)}`,
  )
  .join('\n');

const status =
  statusLines.length === 0
    ? '(clean)'
    : [
        '```',
        ...statusLines.slice(0, 30),
        statusLines.length > 30 ? `… +${statusLines.length - 30} more` : '',
        '```',
      ]
        .filter(Boolean)
        .join('\n');

const md = `# Session handoff (written pre-compact)

Snapshot taken at ${new Date().toISOString()} by write-compact-handoff.mjs (trigger: ${input.trigger ?? 'unknown'}).
Treat this as ground truth for session state — it is more precise than the compacted summary.

## Git state
- Project: ${projectDir(input)}
- Branch: \`${branch || 'unknown'}\`
- Upstream: ${upstream}
- Working tree (${statusLines.length} changed file(s)):

${status}

## Recent commits
\`\`\`
${commits || '(none)'}
\`\`\`

## Recent tool activity (last ${Math.min(evidence.length, 25)} of ${evidence.length} calls)
${tail || '(no evidence ledger for this session)'}

## Resuming
- Uncommitted or unpushed work listed above is YOURS to finish — commit, push, and drive the PR to merge.
- If validation (pc-* chunks) does not appear in the activity list above, it has NOT run yet.
- Re-check AGENTS.md rules before continuing if anything is ambiguous.
`;

try {
  writeFileSync(join(dir, 'handoff.md'), md);
  // Pointer fallback for the post-compact reader in case the session id differs.
  writeFileSync(
    join(tmpdir(), 'claude-hooks', 'last-handoff.txt'),
    join(dir, 'handoff.md'),
  );
} catch {
  /* fail open */
}

process.stdout.write(
  `[HANDOFF] Pre-compact state snapshot written to ${join(dir, 'handoff.md')}\n`,
);
process.exit(0);
