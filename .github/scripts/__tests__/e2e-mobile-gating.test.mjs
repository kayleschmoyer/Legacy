/**
 * Regression test for LS-10332 (revises LS-9658, which revised LS-9411).
 *
 * The PR `e2e-mobile` job in ci-pipeline.yml has two shapes:
 *
 *   - run-all (`e2e-affected-run-all == 'true'`): the full hermetic suite on
 *     the chromium job's shard matrix. LS-9411's original gate carried a
 *     `run-all != 'true'` term that SKIPPED mobile exactly when the selection
 *     escalated to the full suite — 4 of 6 historical "E2E broken on main"
 *     tickets escaped through that inverted gate. It must never come back.
 *   - narrow with affected specs: one shard, 20-minute budget.
 *
 * A narrow change with no affected specs skips the job; ci-gate.js and
 * e2e-affected-gate.js both treat `skipped` as a pass.
 *
 * The nightly (run-playwright-tests.yml) is the backstop for what
 * affected-selection misses: Mobile Chrome runs the full suite with no grep,
 * Mobile Safari stays @critical.
 *
 * Run via: node --test .github/scripts/__tests__/e2e-mobile-gating.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');
const { computeGateConclusion } = require('../ci-gate.js');
const { evaluateShard } = require('../e2e-affected-gate.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

function loadWorkflow(name) {
  return yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8'));
}

function squash(expression) {
  return String(expression).replace(/\s+/g, ' ').trim();
}

const RUN_ALL = "needs.detect-changes.outputs.e2e-affected-run-all == 'true'";
const HAS_SPECS = "needs.detect-changes.outputs.e2e-affected-specs != ''";

describe('ci-pipeline.yml e2e-mobile gating (LS-10332)', () => {
  const { jobs } = loadWorkflow('ci-pipeline.yml');
  const mobile = jobs['e2e-mobile'];
  const jobIf = squash(mobile.if);

  it('runs on run-all OR when there are affected specs', () => {
    assert.ok(
      jobIf.includes(`(${RUN_ALL} || ${HAS_SPECS})`),
      `e2e-mobile job-level if must include "(${RUN_ALL} || ${HAS_SPECS})"; got: ${jobIf}`,
    );
  });

  it('never excludes the run-all case at the job level (the LS-9411 inverted gate)', () => {
    assert.ok(
      !/e2e-affected-run-all\s*!=/.test(jobIf),
      'e2e-mobile must not be skipped on run-all — that gate let mobile ' +
        `regressions through before LS-9658; got: ${jobIf}`,
    );
  });

  it('uses the full shard matrix on run-all and a single shard otherwise', () => {
    assert.equal(
      squash(mobile.strategy.matrix.shard),
      `\${{ fromJSON(${RUN_ALL} && needs.detect-changes.outputs.e2e-shard-matrix || '["1/1"]') }}`,
    );
  });

  it('budgets 45 minutes on run-all and 20 on the narrow path', () => {
    assert.equal(
      squash(mobile['timeout-minutes']),
      `\${{ ${RUN_ALL} && 45 || 20 }}`,
    );
  });

  it('keeps the affected-specs step off the run-all path', () => {
    const step = mobile.steps.find(
      (candidate) =>
        candidate.name === 'E2E Tests (Mobile Chrome — affected specs)',
    );
    assert.ok(step, 'affected-specs step must still exist');
    const stepIf = squash(step.if);
    assert.ok(
      stepIf.includes(
        "needs.detect-changes.outputs.e2e-affected-run-all != 'true'",
      ),
    );
    assert.ok(stepIf.includes(HAS_SPECS));
  });

  it('NEGATIVE CONTROL: the chromium e2e job is not gated on affected specs', () => {
    const e2eIf = squash(jobs.e2e.if);
    assert.ok(
      !e2eIf.includes('e2e-affected-specs'),
      'the chromium e2e job always runs its @critical safety net',
    );
  });
});

describe('gates treat a skipped e2e-mobile as OK and a failed one as blocking (LS-10332)', () => {
  const green = {
    lint: 'success',
    test: 'success',
    build: 'success',
    'custom-checks': 'success',
    'lockfile-check': 'success',
    e2e: 'success',
  };

  it('CI Gate passes when e2e-mobile was skipped (narrow, no affected specs)', () => {
    const verdict = computeGateConclusion({
      ...green,
      'e2e-mobile': 'skipped',
    });
    assert.equal(verdict.conclusion, 'success');
  });

  it('CI Gate fails when a run-all e2e-mobile shard failed', () => {
    const verdict = computeGateConclusion({
      ...green,
      'e2e-mobile': 'failure',
    });
    assert.equal(verdict.conclusion, 'failure');
  });

  it('e2e-affected passes a skipped e2e-mobile and fails a failed one', () => {
    assert.equal(evaluateShard('e2e-mobile', 'skipped', []).pass, true);
    assert.equal(evaluateShard('e2e-mobile', 'failure', []).pass, false);
  });
});

describe('run-playwright-tests.yml nightly mobile matrix (LS-10332)', () => {
  const script = loadWorkflow(
    'run-playwright-tests.yml',
  ).jobs.prepare.steps.find((step) => step.id === 'set').run;
  const mobileLines = script
    .split('\n')
    .filter((line) => !line.trim().startsWith('#') && line.includes('Mobile '));

  it('Mobile Chrome runs the full suite — no grep filter', () => {
    const chrome = mobileLines.filter((line) => line.includes('Mobile Chrome'));
    assert.equal(chrome.length, 1, 'exactly one Mobile Chrome matrix emitter');
    assert.ok(
      !chrome[0].includes('grep'),
      `Mobile Chrome must not carry a grep filter; got: ${chrome[0].trim()}`,
    );
    assert.ok(
      chrome[0].includes('emit_shards e2e "$E2E_SHARD_COUNT"'),
      'the full Mobile Chrome suite is sharded like the chromium e2e entries',
    );
  });

  it('chromium e2e and Mobile Chrome share one shard count (LS-11034)', () => {
    assert.match(script, /^\s*E2E_SHARD_COUNT=\d+\s*$/m);
    const chromium = script
      .split('\n')
      .filter(
        (line) =>
          !line.trim().startsWith('#') &&
          line.includes('emit_shards e2e') &&
          !line.includes('Mobile '),
      );
    assert.deepEqual(
      chromium.map((line) => line.trim()),
      ['emit_shards e2e "$E2E_SHARD_COUNT"'],
    );
  });

  it('Mobile Safari stays @critical', () => {
    const safari = mobileLines.filter((line) => line.includes('Mobile Safari'));
    assert.equal(safari.length, 1, 'exactly one Mobile Safari matrix emitter');
    assert.ok(safari[0].includes('grep:"@critical"'));
  });
});
