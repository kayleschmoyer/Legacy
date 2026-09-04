/**
 * Regression test for LS-9600.
 *
 * .github/workflows/upload-lambdas.yml gates the lambda upload behind
 * `verify-ci` (job 0b) and `detect` (job 1). Before this fix, `verify-ci`'s
 * `if:` skipped the job whenever `trigger-ci` did not succeed — including
 * when `trigger-ci` *failed* — so a failed CI trigger produced the exact
 * same `verify-ci.result == 'skipped'` signal as "no CI check was
 * requested". `detect`'s `if:` treats `skipped` as a pass, so a genuinely
 * failed CI trigger silently opened the upload gate (observed live:
 * https://github.com/bkrupa/legacy-sports/actions/runs/32615474886).
 *
 * This test extracts the real `if:` expressions for `verify-ci` and
 * `detect` from the workflow file and evaluates them against the job
 * outcome matrix that matters, so a future edit that reintroduces the hole
 * fails this suite instead of waiting for a real red-CI deploy to surface
 * it again (arranging a real one is awkward — see the ticket's risk note).
 *
 * Run via: node --test scripts/__tests__/upload-lambdas-ci-gate.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const WORKFLOW_PATH = resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'upload-lambdas.yml',
);

function loadJobIf(jobName) {
  const doc = yaml.load(readFileSync(WORKFLOW_PATH, 'utf8'));
  const job = doc.jobs[jobName];
  assert.ok(job, `expected jobs.${jobName} to exist in upload-lambdas.yml`);
  assert.equal(
    typeof job.if,
    'string',
    `expected jobs.${jobName}.if to be a string`,
  );
  return job.if;
}

/**
 * Evaluates one of this workflow's `if:` strings against a fixed vocabulary
 * of GitHub Actions expressions (always(), needs.<job>.result, inputs[...]).
 * Not a general expression parser — deliberately narrow to what this
 * workflow actually writes, so it stays honest about what it's asserting.
 */
function evalWorkflowIf(
  expr,
  { triggerCiResult, verifyCiResult, skipCiCheck },
) {
  const substituted = expr
    .replace(/always\(\)/g, 'true')
    .replace(
      /needs\.trigger-ci\.result/g,
      JSON.stringify(triggerCiResult ?? null),
    )
    .replace(
      /needs\.verify-ci\.result/g,
      JSON.stringify(verifyCiResult ?? null),
    )
    .replace(/inputs\['skip-ci-check'\]/g, JSON.stringify(skipCiCheck ?? false))
    .replace(/==(?!=)/g, '===')
    .replace(/!=(?!=)/g, '!==');

  return Function(`"use strict"; return (${substituted});`)();
}

/**
 * Models verify-ci's own job result given trigger-ci's result, per the
 * step-level guard added for LS-9600: the job fails internally when
 * trigger-ci failed, rather than being skipped.
 */
function verifyCiJobResult(willRun, triggerCiResult) {
  if (!willRun) return 'skipped';
  if (triggerCiResult === 'failure') return 'failure';
  return 'success'; // the real CI-status-check step; assumed to pass here
}

test('LS-9600: a failed trigger-ci blocks detect/upload when run-ci-first was used', () => {
  const verifyCiIf = loadJobIf('verify-ci');
  const detectIf = loadJobIf('detect');

  const verifyWillRun = evalWorkflowIf(verifyCiIf, {
    triggerCiResult: 'failure',
    skipCiCheck: false,
  });
  assert.equal(
    verifyWillRun,
    true,
    'verify-ci must still run when trigger-ci failed',
  );

  const verifyResult = verifyCiJobResult(verifyWillRun, 'failure');
  assert.equal(
    verifyResult,
    'failure',
    'verify-ci must fail, not skip, when trigger-ci failed',
  );

  const detectWillRun = evalWorkflowIf(detectIf, {
    verifyCiResult: verifyResult,
  });
  assert.equal(
    detectWillRun,
    false,
    'detect (and therefore upload) must not run when verify-ci failed — AC1',
  );
});

test('LS-9600: the ordinary path (run-ci-first omitted) still uploads normally', () => {
  const verifyCiIf = loadJobIf('verify-ci');
  const detectIf = loadJobIf('detect');

  // trigger-ci is skipped entirely (run-ci-first not requested).
  const verifyWillRun = evalWorkflowIf(verifyCiIf, {
    triggerCiResult: 'skipped',
    skipCiCheck: false,
  });
  assert.equal(
    verifyWillRun,
    true,
    'verify-ci must run to perform the real CI check',
  );

  const verifyResult = verifyCiJobResult(verifyWillRun, 'skipped');
  assert.equal(verifyResult, 'success');

  const detectWillRun = evalWorkflowIf(detectIf, {
    verifyCiResult: verifyResult,
  });
  assert.equal(detectWillRun, true, 'detect must run — AC2');
});

test('LS-9600: skip-ci-check still bypasses verify-ci unchanged', () => {
  const verifyCiIf = loadJobIf('verify-ci');
  const detectIf = loadJobIf('detect');

  for (const triggerCiResult of ['failure', 'success', 'skipped']) {
    const verifyWillRun = evalWorkflowIf(verifyCiIf, {
      triggerCiResult,
      skipCiCheck: true,
    });
    assert.equal(
      verifyWillRun,
      false,
      `verify-ci must be skipped under skip-ci-check regardless of trigger-ci (${triggerCiResult})`,
    );

    const verifyResult = verifyCiJobResult(verifyWillRun, triggerCiResult);
    const detectWillRun = evalWorkflowIf(detectIf, {
      verifyCiResult: verifyResult,
    });
    assert.equal(detectWillRun, true, 'detect must still run — AC3');
  }
});

test('LS-9600: trigger-ci succeeding still uploads normally', () => {
  const verifyCiIf = loadJobIf('verify-ci');
  const detectIf = loadJobIf('detect');

  const verifyWillRun = evalWorkflowIf(verifyCiIf, {
    triggerCiResult: 'success',
    skipCiCheck: false,
  });
  assert.equal(verifyWillRun, true);

  const verifyResult = verifyCiJobResult(verifyWillRun, 'success');
  assert.equal(verifyResult, 'success');

  const detectWillRun = evalWorkflowIf(detectIf, {
    verifyCiResult: verifyResult,
  });
  assert.equal(
    detectWillRun,
    true,
    'run-ci-first=true against passing CI must still upload',
  );
});
