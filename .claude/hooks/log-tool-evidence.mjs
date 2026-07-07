#!/usr/bin/env node
/**
 * PostToolUse hook: append a compact evidence record for every tool call to a
 * per-session JSONL file. This is the session's ground-truth activity ledger.
 *
 * Consumers:
 *   - delivery-gate.mjs (Stop) — refuses a "done" without validation evidence
 *   - write-compact-handoff.mjs (PreCompact) — recent-activity section of the
 *     post-compact handoff
 *   - humans doing post-hoc session audits (evidence.jsonl is plain JSONL)
 *
 * Record shape: { ts, tool, arg, ok }
 *   arg — one short string per tool (command first line, file path, target…)
 *   ok  — best-effort success flag derived from tool_response; `false` only
 *         when the response positively signals failure, otherwise true.
 *
 * Storage: <os-tmpdir>/claude-hooks/<session_id>/evidence.jsonl, rotated at
 * ~4 MB. Silent and advisory — always exits 0, never emits output.
 */

import { join } from 'path';
import {
  readHookInput,
  appendJsonl,
  rotateIfLarge,
  sessionDir,
  truncate,
} from './lib/hook-utils.mjs';

const input = readHookInput();
if (!input?.tool_name) process.exit(0);

const tool = input.tool_name;
const ti = input.tool_input ?? {};

function summarise() {
  if (typeof ti !== 'object' || ti === null) return '';
  if (ti.command != null)
    return truncate(String(ti.command).split('\n')[0], 200); // Bash
  if (ti.file_path != null) return truncate(ti.file_path, 200); // Read/Edit/Write
  if (ti.chunk != null) return truncate(ti.chunk, 80); // nx_run_pc_chunk
  if (ti.target != null) return truncate(ti.target, 120); // make_run / nx_run*
  if (ti.sql != null || ti.query != null)
    return truncate(ti.sql ?? ti.query, 160); // db_query
  if (ti.pattern != null) return truncate(ti.pattern, 120); // Grep/Glob
  if (ti.description != null) return truncate(ti.description, 120); // Agent
  if (ti.skill != null) return truncate(`${ti.skill} ${ti.args ?? ''}`, 120); // Skill
  if (ti.prompt != null) return truncate(ti.prompt, 120);
  const keys = Object.keys(ti);
  return keys.length ? truncate(JSON.stringify(ti), 120) : '';
}

/** Best-effort failure detection across heterogeneous tool_response shapes. */
function inferOk() {
  const r = input.tool_response;
  if (r == null) return true;
  if (typeof r !== 'object') return true;
  if (Array.isArray(r)) return !r.some((item) => item?.is_error === true);
  if (r.success === false) return false;
  if (r.is_error === true || r.isError === true) return false;
  if (r.interrupted === true) return false;
  if (r.error != null && r.success !== true) return false;
  return true;
}

const dir = sessionDir(input);
const file = join(dir, 'evidence.jsonl');
rotateIfLarge(file, 4 * 1024 * 1024);
appendJsonl(file, {
  ts: new Date().toISOString(),
  tool,
  arg: summarise(),
  ok: inferOk(),
});

process.exit(0);
