#!/usr/bin/env node
/**
 * PreToolUse hook: inject skill-load reminders when editing trigger-critical paths.
 *
 * Emits a one-line reminder to stdout exactly once per session per category.
 * Claude Code injects PreToolUse stdout into the agent context before the tool
 * executes, so the agent sees the reminder immediately.
 *
 * Deduplication: session-scoped marker files under OS temp, keyed by session_id
 * from the hook payload (no SessionStart cleanup needed — each session gets its
 * own subdirectory).
 *
 * Pure Node — no child process spawning, safe on Windows (no console flash).
 * Always exits 0: advisory only, never blocks a tool call.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const RULES = [
  {
    // terraform/**/*.tf
    pattern: /(?:^|[/\\])terraform[/\\].*\.tf$/,
    marker: 'terraform',
    message:
      '[SKILL REMINDER] Terraform file detected — load .agents/skills/terraform-permission-planning/SKILL.md before pushing. A missed load costs CI AccessDenied cycles (IAM plan → diff → patch → local-plan-as-CI-role loop).',
  },
  {
    // lib/db-client/**/migrations/**
    pattern: /[/\\]lib[/\\]db-client[/\\](?:[^/\\]+[/\\])*migrations[/\\]/,
    marker: 'migrations',
    message:
      '[SKILL REMINDER] Migration file detected — load .agents/skills/database/SKILL.md (or run /database) before proceeding. Migration immutability rules apply: never edit an already-applied migration.',
  },
  {
    // apps/web-e2e/**
    pattern: /(?:^|[/\\])apps[/\\]web-e2e[/\\]/,
    marker: 'e2e',
    message:
      '[SKILL REMINDER] E2E test file detected — load .agents/skills/testing/references/e2e-determinism.md before proceeding. E2E flake is a P1 bug; the 12-lever determinism checklist gates every E2E PR.',
  },
];

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

const filePath = data?.tool_input?.file_path;
if (!filePath) process.exit(0);

// Use session_id for natural per-session scoping (no SessionStart cleanup needed).
const sessionId = data?.session_id ?? 'default';
const normalized = filePath.replace(/\\/g, '/');

for (const rule of RULES) {
  if (!rule.pattern.test(normalized)) continue;

  try {
    const sessionDir = join(tmpdir(), 'claude-skill-reminders', sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const markerFile = join(sessionDir, rule.marker);
    if (!existsSync(markerFile)) {
      writeFileSync(markerFile, '1');
      process.stdout.write(rule.message + '\n');
    }
  } catch {
    // Fail open — a hook error must never block a tool call.
  }
  break; // Only one reminder per edit call (first matching rule wins).
}

process.exit(0);
