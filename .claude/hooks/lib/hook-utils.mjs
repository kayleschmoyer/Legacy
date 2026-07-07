/**
 * Shared helpers for the node-based Claude Code hooks in .claude/hooks/*.mjs.
 *
 * Conventions (mirrors the existing shell hooks):
 *   - Hooks receive JSON on stdin (session_id, hook_event_name, tool_name, ...).
 *   - Hooks must fail OPEN: any parse/filesystem error results in exit 0 with
 *     no output, never a blocked tool call or a crashed session.
 *   - Per-session runtime state lives under <os-tmpdir>/claude-hooks/<session_id>/
 *     so concurrent sessions never share counters (unlike the legacy shared
 *     claude-compact-counter file).
 *   - Persistent audit trails live under .claude/audit/ (gitignored).
 */

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

/** Read and parse the hook input JSON from stdin. Returns null on any failure. */
export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

/** Project root, normalised to forward slashes (Windows Git Bash safe). */
export function projectDir(input) {
  const dir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  return dir.replace(/\\/g, '/');
}

/** Per-session runtime state directory under the OS temp dir. Created on demand. */
export function sessionDir(input) {
  const id = String(input?.session_id || 'unknown-session').replace(
    /[^A-Za-z0-9_-]/g,
    '_',
  );
  const dir = join(tmpdir(), 'claude-hooks', id);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* fail open */
  }
  return dir;
}

/** Persistent (gitignored) audit directory inside the repo. Created on demand. */
export function auditDir(input) {
  const dir = join(projectDir(input), '.claude', 'audit');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* fail open */
  }
  return dir;
}

/** Append one JSON line to a file. Best-effort, never throws. */
export function appendJsonl(file, obj) {
  try {
    appendFileSync(file, `${JSON.stringify(obj)}\n`);
  } catch {
    /* fail open */
  }
}

/** Read a JSONL file into an array of parsed objects, skipping bad lines. */
export function readJsonl(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Read a JSON state file, returning fallback on any failure. */
export function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

/** Write a JSON state file. Best-effort, never throws. */
export function writeJson(file, obj) {
  try {
    writeFileSync(file, JSON.stringify(obj));
  } catch {
    /* fail open */
  }
}

/** Increment a plain integer counter file and return the new count. */
export function bumpCounter(file) {
  let count = 0;
  try {
    const raw = readFileSync(file, 'utf8');
    if (/^\d+$/.test(raw)) count = Number(raw);
  } catch {
    /* first bump */
  }
  count += 1;
  try {
    writeFileSync(file, String(count));
  } catch {
    /* fail open */
  }
  return count;
}

/** Rotate a log file once it grows past maxBytes (keeps one .old generation). */
export function rotateIfLarge(file, maxBytes) {
  try {
    if (statSync(file).size > maxBytes)
      renameSync(file, `${file.replace(/\.jsonl$/, '')}.old.jsonl`);
  } catch {
    /* file missing or rename failed — fine either way */
  }
}

/** Truncate a string for log/message output, collapsing newlines. */
export function truncate(value, max = 200) {
  const oneLine = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** Run a git command in the project dir. Returns trimmed stdout or '' on failure. */
export function git(input, args) {
  try {
    return execFileSync('git', ['-C', projectDir(input), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}
