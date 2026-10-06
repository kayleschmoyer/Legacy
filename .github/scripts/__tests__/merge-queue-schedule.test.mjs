/**
 * Regression test for LS-10600.
 *
 * merge-queue.yml had no `schedule` (LS-8289), so a queue run lost before
 * any step executed left nothing to re-trigger the queue. On 2026-10-05
 * PR #8394 sat green in the queue after run 37365045732 failed runner
 * provisioning. The fix restores a 30-minute safety-net cron whose first
 * step exits cheaply when nothing is queued.
 *
 * This file guards three things:
 *   - the cron exists, ticks about every 30 minutes, and avoids :00/:30
 *   - the job's `if:` admits `schedule` events
 *   - an idle tick skips every later step, and the idle check's script
 *     reports idle only when no queue label and no mq/test/* set exist
 *
 * Run via: node --test .github/scripts/__tests__/merge-queue-schedule.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.resolve(
  __dirname,
  '..',
  '..',
  'workflows',
  'merge-queue.yml',
);

const workflow = yaml.load(fs.readFileSync(WORKFLOW, 'utf8'));
const job = workflow.jobs['process-merge-queue'];
const IDLE_GATE = "steps.idle.outputs.idle != 'true'";

function idleStep() {
  return job.steps.find((s) => s.id === 'idle');
}

describe('merge-queue.yml safety-net schedule (LS-10600)', () => {
  it('has a single cron that ticks twice an hour off :00/:30', () => {
    const schedule = workflow.on.schedule;
    assert.ok(Array.isArray(schedule), 'merge-queue.yml must keep a schedule');
    assert.equal(schedule.length, 1);
    const [minute, ...rest] = schedule[0].cron.split(/\s+/);
    assert.deepEqual(rest, ['*', '*', '*', '*']);
    const minutes = minute.split(',').map(Number);
    assert.equal(minutes.length, 2, 'expected two ticks per hour');
    assert.equal(
      (minutes[1] - minutes[0] + 60) % 60,
      30,
      'ticks should be 30 minutes apart',
    );
    for (const m of minutes) {
      assert.ok(m % 30 !== 0, `minute ${m} should be jittered off :00/:30`);
    }
  });

  it("admits schedule events in the job's if: condition", () => {
    assert.match(job.if, /github\.event_name == 'schedule'/);
  });

  it('runs the idle check first, on schedule only, with the built-in token', () => {
    const step = idleStep();
    assert.ok(step, 'the "idle" step must exist');
    assert.equal(job.steps[0], step, 'the idle check must be the first step');
    assert.equal(step.if, "github.event_name == 'schedule'");
    assert.equal(step.env.GH_TOKEN, '${{ github.token }}');
    assert.match(step.run, /merge-when-ready/);
    assert.match(step.run, /merge-to-parent/);
    assert.match(step.run, /mq\/test\//);
  });

  it('every later step is skipped on an idle tick', () => {
    for (const step of job.steps.slice(1)) {
      const label = step.name || step.uses;
      const cond = step.if || '';
      if (cond.includes(IDLE_GATE)) continue;
      // Steps without the gate must be pinned to non-schedule events.
      assert.ok(
        cond.includes('github.event_name ==') && !cond.includes('schedule'),
        `step "${label}" would run on an idle schedule tick; gate it with ${IDLE_GATE}`,
      );
    }
  });

  it('gates the token mints, checkout and the processor on the idle check', () => {
    const gated = job.steps.filter((s) => (s.if || '').includes(IDLE_GATE));
    const names = gated.map((s) => s.id || s.name || s.uses);
    for (const expected of [
      'generate-token',
      'ci-app-key',
      'ci-app-token',
      'Process Enhanced Merge Queue',
    ]) {
      assert.ok(names.includes(expected), `${expected} must be idle-gated`);
    }
    assert.ok(
      gated.some((s) => (s.uses || '').startsWith('actions/checkout@')),
      'checkout must be idle-gated',
    );
  });
});

// Run the idle check's bash against a stub `gh` and read $GITHUB_OUTPUT.
function runIdleCheck({ mergeWhenReady, mergeToParent, batches }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-idle-'));
  const stub = path.join(dir, 'gh');
  fs.writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      'case "$*" in',
      `  *"--label merge-when-ready"*) echo ${mergeWhenReady} ;;`,
      `  *"--label merge-to-parent"*) echo ${mergeToParent} ;;`,
      `  api*matching-refs/heads/mq/test/*) echo ${batches} ;;`,
      '  *) echo "unexpected gh call: $*" >&2; exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  fs.chmodSync(stub, 0o755);
  const output = path.join(dir, 'out');
  fs.writeFileSync(output, '');
  const res = spawnSync('bash', ['-c', idleStep().run], {
    env: {
      ...process.env,
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      GH_REPO: 'bkrupa/legacy-sports',
      GITHUB_OUTPUT: output,
    },
    encoding: 'utf8',
  });
  const out = fs.readFileSync(output, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: res.status, stderr: res.stderr, out };
}

describe(
  'merge-queue.yml idle check script (LS-10600)',
  { skip: process.platform === 'win32' && 'needs a POSIX bash' },
  () => {
    it('reports idle when nothing is queued and no batch is in flight', () => {
      const r = runIdleCheck({
        mergeWhenReady: 0,
        mergeToParent: 0,
        batches: 0,
      });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.out, /^idle=true$/m);
    });

    for (const [label, input] of [
      [
        'a merge-when-ready PR',
        { mergeWhenReady: 1, mergeToParent: 0, batches: 0 },
      ],
      [
        'a merge-to-parent PR',
        { mergeWhenReady: 0, mergeToParent: 1, batches: 0 },
      ],
      [
        'an in-flight mq/test/* set',
        { mergeWhenReady: 0, mergeToParent: 0, batches: 1 },
      ],
    ]) {
      it(`proceeds when there is ${label}`, () => {
        const r = runIdleCheck(input);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.out, /^idle=false$/m);
      });
    }
  },
);
