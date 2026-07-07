#!/usr/bin/env node
/**
 * SessionStart hook (matcher: "compact"): inject the pre-compact handoff back
 * into context right after compaction.
 *
 * Pairs with write-compact-handoff.mjs (PreCompact). SessionStart stdout is
 * added to the agent's context, so the freshly-compacted session resumes with
 * the exact git/validation state instead of a lossy summary of it.
 *
 * Lookup order:
 *   1. <os-tmpdir>/claude-hooks/<session_id>/handoff.md (normal case — the
 *      session id is stable across a compact)
 *   2. The last-handoff.txt pointer, if it points at a handoff written within
 *      the last 2 hours (fallback for id changes across the boundary)
 *
 * Advisory only — always exits 0.
 */

import { readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readHookInput, sessionDir } from './lib/hook-utils.mjs';

const input = readHookInput();
if (!input) process.exit(0);

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function readFresh(path) {
  try {
    if (Date.now() - statSync(path).mtimeMs > MAX_AGE_MS) return '';
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

let handoff = readFresh(join(sessionDir(input), 'handoff.md'));

if (!handoff) {
  try {
    const pointer = readFileSync(
      join(tmpdir(), 'claude-hooks', 'last-handoff.txt'),
      'utf8',
    ).trim();
    if (pointer) handoff = readFresh(pointer);
  } catch {
    /* no pointer — fine */
  }
}

if (handoff) {
  process.stdout.write(
    `[POST-COMPACT HANDOFF] Context was just compacted. The following snapshot was taken ` +
      `immediately before compaction and is ground truth for session state:\n\n${handoff}\n`,
  );
}

process.exit(0);
