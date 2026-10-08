/**
 * Regression test for LS-10312 (folds in LS-10306).
 *
 * The self-hosted CI_RUNNER_LABEL pool is EC2 spot capacity. Sep 22-29 2026
 * CloudTrail shows 153 CI jobs killed by spot reclamation (BidEvictedEvent),
 * 138 of them on Sep 29. Two short bookkeeping jobs lived on that pool:
 *
 *   - ci-pipeline.yml `summarize` posts the CI Gate verdict. When reclaimed,
 *     CI Gate stays at the seeded "Waiting for CI Pipeline to report results"
 *     forever — and ci-orchestrator.yml's report-runner-shutdown, which
 *     `needs` the pipeline, queues behind the same dying pool (LS-10306).
 *   - merge-queue.yml `process-merge-queue` was reclaimed 19 times.
 *
 * lambda-terraform-apply.yml's report-runner-shutdown had the same LS-9710
 * shape as the orchestrator's: a job reporting the pool's death, scheduled on
 * that pool. All three are pinned to ubuntu-latest.
 *
 * Run via: node --test .github/scripts/__tests__/bookkeeping-runner-placement.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

function loadWorkflow(name) {
  return yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8'));
}

const PINNED_JOBS = [
  ['ci-pipeline.yml', 'summarize'],
  ['merge-queue.yml', 'process-merge-queue'],
  ['lambda-terraform-apply.yml', 'report-runner-shutdown'],
  // merge-queue review (2026-10): API-only label bookkeeping in the orchestrator.
  ['ci-orchestrator.yml', 'restore-merge-label-on-success'],
  ['ci-orchestrator.yml', 'label-pr'],
  ['ci-orchestrator.yml', 'remove-merge-label-on-failure'],
];

describe('bookkeeping jobs run on GitHub-hosted runners (LS-10312)', () => {
  for (const [file, jobId] of PINNED_JOBS) {
    it(`${file} ${jobId} is pinned to ubuntu-latest`, () => {
      const job = loadWorkflow(file).jobs[jobId];
      assert.ok(job, `${file} must still define a "${jobId}" job`);
      assert.equal(
        job['runs-on'],
        'ubuntu-latest',
        `${jobId} must not fall back to the spot self-hosted pool — a reclaimed ` +
          'bookkeeping job strands the CI Gate verdict or the merge queue',
      );
    });
  }

  it('NEGATIVE CONTROL: the heavy ci-pipeline jobs keep the self-hosted fallback', () => {
    const { jobs } = loadWorkflow('ci-pipeline.yml');
    for (const jobId of ['lint', 'test', 'build']) {
      assert.match(
        jobs[jobId]['runs-on'],
        /CI_RUNNER_LABEL/,
        `${jobId} should stay on the self-hosted pool; only bookkeeping moved`,
      );
    }
  });

  it('summarize still posts CI Gate via ci-gate.js with the orchestrator dispatch fallback', () => {
    const steps = loadWorkflow('ci-pipeline.yml').jobs.summarize.steps;
    const gate = steps.find((s) => s.name === 'Post CI Gate aggregate status');
    assert.ok(
      gate,
      'summarize must keep its "Post CI Gate aggregate status" step',
    );
    assert.match(
      gate.with.script,
      /require\('\.\/\.github\/scripts\/ci-gate\.js'\)/,
    );
    assert.match(gate.with.script, /postCiGate\(/);
    assert.equal(gate.env.DISPATCH_PR_NUMBER, '${{ inputs.pr-number }}');
    assert.equal(gate.env.DISPATCH_HEAD_SHA, '${{ inputs.head-sha }}');
  });
});
