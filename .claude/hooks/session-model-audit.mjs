#!/usr/bin/env node
/**
 * SessionStart + Stop hook: audit which model served each session.
 *
 * Why: autonomous ticket work assumes a frontier-tier model. If a session is
 * silently running on a small/fast model (misconfigured launcher, fallback
 * during an incident), quality drops with no visible signal. This hook keeps a
 * persistent per-session model trail and warns in-context when the detected
 * model does not match the expected family.
 *
 * Detection order (best effort — model id is not part of every hook payload):
 *   1. `model` field on the hook input (newer Claude Code versions)
 *   2. ANTHROPIC_MODEL / CLAUDE_MODEL environment variables
 *   3. The most recent assistant message's `message.model` in the session
 *      transcript (available on resume/compact starts and at Stop time)
 *
 * Registered for both SessionStart (early warning) and Stop (finalises the
 * audit record once the transcript definitely contains assistant turns).
 *
 * Audit trail: .claude/audit/session-models.jsonl (gitignored).
 * Config: LS_EXPECTED_MODELS — pipe-separated list of case-insensitive
 * substrings the model id must contain one of (default:
 * opus|sonnet|fable|mythos). Treated as plain substrings, never compiled to a
 * regex (avoids ReDoS from environment input). Set to "*" to disable.
 *
 * Advisory only — always exits 0, never blocks the session or the stop.
 */

import { closeSync, openSync, readSync, statSync } from 'fs';
import {
  readHookInput,
  appendJsonl,
  auditDir,
  projectDir,
  git,
} from './lib/hook-utils.mjs';
import { join } from 'path';

const input = readHookInput();
if (!input) process.exit(0);

const event = input.hook_event_name || 'unknown';

function modelFromInput() {
  const m = input.model;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object')
    return m.id || m.model || m.display_name || '';
  return '';
}

function modelFromEnv() {
  return process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || '';
}

/** Scan the tail of the transcript JSONL for the latest assistant model id. */
function modelFromTranscript() {
  const path = input.transcript_path;
  if (!path) return '';
  try {
    // Only read the tail of large transcripts; drop the first partial line.
    const size = statSync(path).size;
    const TAIL = 512 * 1024;
    const start = Math.max(0, size - TAIL);
    const buf = Buffer.alloc(size - start);
    const fd = openSync(path, 'r');
    try {
      readSync(fd, buf, 0, buf.length, start);
    } finally {
      closeSync(fd);
    }
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    const lines = text.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const model = entry?.message?.model || entry?.model;
        if (
          model &&
          (entry?.type === 'assistant' || entry?.message?.role === 'assistant')
        ) {
          return String(model);
        }
      } catch {
        /* skip unparseable line */
      }
    }
  } catch {
    /* transcript unreadable — fine */
  }
  return '';
}

const model =
  modelFromInput() || modelFromEnv() || modelFromTranscript() || 'unknown';

appendJsonl(join(auditDir(input), 'session-models.jsonl'), {
  ts: new Date().toISOString(),
  event,
  source: input.source,
  sessionId: input.session_id,
  model,
  branch: git(input, ['rev-parse', '--abbrev-ref', 'HEAD']) || undefined,
  cwd: projectDir(input),
});

// Warn (in-context) only at SessionStart, and only when we positively detected
// a model that does not match the expected family. Unknown stays silent — the
// Stop-time record will capture it once the transcript has assistant turns.
if (event === 'SessionStart' && model !== 'unknown') {
  // LS_EXPECTED_MODELS is a pipe-separated list of case-insensitive
  // substrings, NOT a regex — plain includes() matching avoids constructing a
  // RegExp from environment input (ReDoS). "*" (or an empty list) disables
  // the warning.
  const expected = process.env.LS_EXPECTED_MODELS || 'opus|sonnet|fable|mythos';
  const families = expected
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const lowerModel = model.toLowerCase();
  const matches =
    families.length === 0 ||
    families.includes('*') ||
    families.some((family) => lowerModel.includes(family));
  if (!matches) {
    process.stdout.write(
      `[MODEL AUDIT] This session is running on \`${model}\`, which does not match the expected ` +
        `model families (${families.join(', ')}). Autonomous ticket work assumes a frontier-tier ` +
        `model — surface this to the user before starting heavy multi-step work.\n`,
    );
  }
}

process.exit(0);
