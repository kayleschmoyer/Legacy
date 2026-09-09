/**
 * Regression test for LS-9710.
 *
 * On PR #7328 the "⚡ Report Runner Shutdown" job inherited
 * `needs.determine-scope.outputs.runner-label || 'ubuntu-latest'` like the
 * other post-pipeline jobs, so it queued on the self-hosted runner pool. When
 * that job's sole reason for running was that the self-hosted pool had just
 * shut down, it had zero capacity to schedule the job — it queued forever.
 * Because ci-orchestrator.yml's concurrency group is `orchestrator-<pr
 * number>` with `cancel-in-progress: false`, the stuck run held that group's
 * slot indefinitely and every subsequent push's orchestrator run queued
 * behind it, so CI Gate never registered for the PR's actual current head.
 *
 * `timeout-minutes` does not help here: GitHub does not start that clock
 * until a runner has picked the job up, and the whole failure mode is that no
 * runner ever does. The fix pins this job to `ubuntu-latest`, which always
 * has capacity, instead of narrowing the concurrency group (which would
 * change LS-9053/LS-9810's established per-PR grouping).
 *
 * This test guards against the fallback expression creeping back in.
 *
 * Run via: node --test .github/scripts/__tests__/ci-orchestrator-workflow.test.mjs
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
const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'workflows',
  'ci-orchestrator.yml',
);

function loadOrchestrator() {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  return { raw, parsed: yaml.load(raw) };
}

describe('ci-orchestrator.yml — report-runner-shutdown scheduling (LS-9710)', () => {
  it('pins report-runner-shutdown to ubuntu-latest, not the self-hosted runner-label fallback', () => {
    const { parsed } = loadOrchestrator();
    const job = parsed.jobs['report-runner-shutdown'];
    assert.ok(
      job,
      'report-runner-shutdown job must exist in ci-orchestrator.yml',
    );
    assert.equal(
      job['runs-on'],
      'ubuntu-latest',
      'report-runner-shutdown must run on ubuntu-latest — a job that reports a ' +
        'self-hosted runner shutdown must not itself depend on that same pool ' +
        'having capacity (LS-9710)',
    );
  });

  it('keeps the sibling post-pipeline jobs on the self-hosted-when-available fallback', () => {
    // Confirms the LS-9710 fix only narrowed report-runner-shutdown's
    // scheduling, not the other post-pipeline jobs that don't share its
    // "reports on pool health" purpose.
    const { parsed } = loadOrchestrator();
    const fallbackExpr =
      "${{ needs.determine-scope.outputs.runner-label || 'ubuntu-latest' }}";
    for (const jobName of [
      'label-pr',
      'restore-merge-label-on-success',
      'remove-merge-label-on-failure',
    ]) {
      const job = parsed.jobs[jobName];
      assert.ok(job, `${jobName} job must exist in ci-orchestrator.yml`);
      assert.equal(
        job['runs-on'],
        fallbackExpr,
        `${jobName} should still use the runner-label fallback`,
      );
    }
  });

  it('documents the LS-9710 mitigation alongside the LS-9053/LS-9810 concurrency note', () => {
    const { raw } = loadOrchestrator();
    assert.match(
      raw,
      /LS-9710/,
      'ci-orchestrator.yml should document the LS-9710 fix so future readers understand it',
    );
    // The concurrency-group comment block already documents LS-9053/LS-9810;
    // the report-runner-shutdown job comment must relate LS-9710 to it.
    const concurrencyBlockEnd = raw.indexOf('concurrency:');
    const reportJobStart = raw.indexOf('report-runner-shutdown:');
    assert.ok(concurrencyBlockEnd > -1 && reportJobStart > concurrencyBlockEnd);
    // The LS-9710 comment sits between the job key and its `runs-on:` line
    // (the descriptive block above the job key is the pre-existing LS-9451
    // note), so look forward from the job key rather than backward from it.
    const runsOnOffset = raw.indexOf('runs-on: ubuntu-latest', reportJobStart);
    const reportJobComment = raw.slice(reportJobStart, runsOnOffset);
    assert.match(
      reportJobComment,
      /LS-9053|LS-9810/,
      'the LS-9710 comment should reference the existing LS-9053/LS-9810 concurrency note it relates to',
    );
  });
});
