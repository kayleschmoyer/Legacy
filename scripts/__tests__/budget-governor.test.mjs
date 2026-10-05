/**
 * Tests for .claude/hooks/budget-governor.mjs — the hard-budget block and the
 * session-handoff grace allowance that lets an over-budget session still hand
 * its remaining work to a fresh session.
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/budget-governor.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(
  import.meta.dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'budget-governor.mjs',
);

/** A fresh, isolated session: own temp state dir and own audit dir. */
function makeSession(env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'budget-gov-'));
  const sessionId = `s-${Math.random().toString(36).slice(2)}`;
  const fullEnv = {
    ...process.env,
    TMPDIR: root,
    TEMP: root,
    TMP: root,
    CLAUDE_PROJECT_DIR: root,
    LS_BUDGET_SOFT_CALLS: '100',
    LS_BUDGET_HARD_CALLS: '3',
    LS_BUDGET_HANDOFF_CALLS: '2',
    ...env,
  };
  return (tool_name, tool_input = {}) => {
    const res = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ session_id: sessionId, tool_name, tool_input }),
      env: fullEnv,
      encoding: 'utf8',
    });
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
  };
}

/** Burn calls until the session is at the hard budget. */
function exhaust(call) {
  call('Read');
  call('Read');
}

test('non-checkpoint tools are blocked past the hard budget', () => {
  const call = makeSession();
  exhaust(call);
  const r = call('Read');
  assert.equal(r.code, 2);
  assert.match(r.out, /BUDGET EXCEEDED/);
  assert.match(r.out, /2 of 2 handoff calls left/);
});

test('handoff tools are allowed past the hard budget up to the grace allowance', () => {
  const call = makeSession();
  exhaust(call);
  assert.equal(call('mcp__claude-code-remote__create_session').code, 0);
  assert.equal(
    call('mcp__legacy-sports-dev-process__continuation_post').code,
    0,
  );
  const r = call('mcp__claude-code-remote__send_message');
  assert.equal(r.code, 2, 'grace exhausted — handoff tools block again');
  assert.match(r.out, /0 of 2 handoff calls left/);
});

test('every handoff tool name is recognised', () => {
  for (const tool of [
    'mcp__claude-code-remote__create_session',
    'mcp__claude-code-remote__send_message',
    'mcp__claude-code-remote__send_later',
    'mcp__Claude_Code_Remote__create_session',
    'mcp__ccd_session__spawn_task',
    'mcp__legacy-sports-dev-process__continuation_post',
    'mcp__legacy-sports-dev-process__continuation_status',
  ]) {
    const call = makeSession();
    exhaust(call);
    assert.equal(call(tool).code, 0, `${tool} should get handoff grace`);
  }
});

test('lookalike tools do not get handoff grace', () => {
  for (const tool of [
    'mcp__claude-code-remote__archive_session',
    'mcp__claude-code-remote__create_trigger',
    'mcp__legacy-sports-dev-process__rfc_create',
  ]) {
    const call = makeSession();
    exhaust(call);
    assert.equal(call(tool).code, 2, `${tool} should still be blocked`);
  }
});

test('handoff calls do not consume block budget', () => {
  const call = makeSession({ LS_BUDGET_HANDOFF_CALLS: '10' });
  exhaust(call);
  for (let i = 0; i < 8; i++) {
    assert.equal(call('mcp__claude-code-remote__send_message').code, 0);
  }
  // Still armed: had the 8 handoffs counted as blocks the governor would
  // have disarmed after 5 and this would pass through.
  assert.equal(call('Read').code, 2);
});

test('handoff tools are untouched below the hard budget', () => {
  const call = makeSession();
  assert.equal(call('mcp__claude-code-remote__create_session').code, 0);
  assert.equal(call('Read').code, 0);
});

test('LS_BUDGET_HANDOFF_CALLS=0 removes the grace', () => {
  const call = makeSession({ LS_BUDGET_HANDOFF_CALLS: '0' });
  exhaust(call);
  assert.equal(call('mcp__claude-code-remote__create_session').code, 2);
});
