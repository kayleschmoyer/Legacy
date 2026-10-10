/**
 * Regression test for LS-11027.
 *
 * The e2e and e2e-mobile jobs in ci-pipeline.yml consume only the web build
 * (the S3 `web-build` artifact), so they start as soon as `build` passes
 * instead of waiting on `lint` and `test`. On merge-queue batch run
 * 37980977190 that wait idled every shard for ~17 minutes after build was
 * ready.
 *
 * lint and test still gate the run: `summarize` (which posts CI Gate) needs
 * them directly, so a red lint or test fails CI even though e2e ran and passed.
 *
 * Run via: node --test .github/scripts/__tests__/e2e-after-build.test.mjs
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

const { jobs } = yaml.load(
  fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci-pipeline.yml'), 'utf8'),
);

describe('ci-pipeline.yml e2e starts after build, not after lint/test (LS-11027)', () => {
  for (const name of ['e2e', 'e2e-mobile']) {
    it(`${name} needs only detect-changes and build`, () => {
      assert.deepEqual([...jobs[name].needs].sort(), [
        'build',
        'detect-changes',
      ]);
    });

    it(`${name} job-level if does not wait on lint or test`, () => {
      const jobIf = String(jobs[name].if);
      assert.doesNotMatch(jobIf, /needs\.(lint|test)\./);
      assert.match(jobIf, /needs\.build\.result == 'success'/);
    });
  }

  it('summarize (CI Gate) still needs lint and test directly', () => {
    const needs = jobs.summarize.needs;
    for (const job of ['lint', 'test', 'build', 'e2e', 'e2e-mobile']) {
      assert.ok(needs.includes(job), `summarize must need ${job}`);
    }
  });
});

describe('CI Gate still fails on lint/test when e2e passed (LS-11027)', () => {
  const green = {
    lint: 'success',
    test: 'success',
    build: 'success',
    'custom-checks': 'success',
    'lockfile-check': 'success',
    e2e: 'success',
    'e2e-mobile': 'success',
  };

  it('passes when everything is green', () => {
    assert.equal(computeGateConclusion(green).conclusion, 'success');
  });

  it('fails when test failed even though e2e passed', () => {
    assert.equal(
      computeGateConclusion({ ...green, test: 'failure' }).conclusion,
      'failure',
    );
  });

  it('fails when lint failed even though e2e passed', () => {
    assert.equal(
      computeGateConclusion({ ...green, lint: 'failure' }).conclusion,
      'failure',
    );
  });
});
