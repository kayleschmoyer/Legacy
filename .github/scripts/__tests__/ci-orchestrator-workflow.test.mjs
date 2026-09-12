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

/**
 * LS-10091 negative control.
 *
 * The fix for LS-10091 regenerates a MISSING verdict (see
 * .github/workflows/rerun-cancelled-ci.yml); it must never manufacture a
 * GREEN one. Stripping `merge-when-ready` when a pipeline was cancelled is
 * correct, fail-safe behaviour — a cancelled run proved nothing, so the PR has
 * not been shown green, and leaving the label on would let untested code into
 * the merge queue.
 *
 * These tests exist to fail loudly if anyone "fixes" the symptom by exempting
 * cancellations from label removal instead of re-running the pipeline.
 */
describe('ci-orchestrator.yml — cancelled pipelines never hold merge-when-ready (LS-10091)', () => {
  const COLLECT_RESULTS_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'actions',
    'collect-results',
    'action.yml',
  );

  it('maps a cancelled critical job to overall-status "failure", not "success"', () => {
    const raw = fs.readFileSync(COLLECT_RESULTS_PATH, 'utf8');
    assert.match(
      raw,
      /\[ "\$STEP_RESULT" = "failure" \] \|\| \[ "\$STEP_RESULT" = "cancelled" \]/,
      'collect-results must keep folding `cancelled` into `failure` — this is ' +
        'the single point that makes a cancelled pipeline not-green. ' +
        'Exempting `cancelled` here would let an unverified SHA keep ' +
        'merge-when-ready (LS-10091).',
    );
  });

  it('only restores merge-when-ready on an exact "success" verdict', () => {
    const { parsed } = loadOrchestrator();
    const condition = parsed.jobs['restore-merge-label-on-success'].if;

    assert.match(
      condition,
      /needs\.ci-pipeline\.outputs\.overall-status == 'success'/,
      'restore-merge-label-on-success must require an exact `success` verdict. ' +
        'Widening this to accept `cancelled` (or anything not-failure) would ' +
        're-arm the merge queue on a pipeline that never ran (LS-10091).',
    );
    assert.doesNotMatch(
      condition,
      /cancelled'/,
      'restore-merge-label-on-success must not special-case a cancelled ' +
        'pipeline — a cancelled run has no verdict to restore from.',
    );
  });

  it('keeps remove-merge-label-on-failure free of any cancellation exemption', () => {
    const { parsed } = loadOrchestrator();
    const condition = parsed.jobs['remove-merge-label-on-failure'].if;

    assert.match(
      condition,
      /needs\.ci-pipeline\.outputs\.overall-status == 'failure'/,
      'remove-merge-label-on-failure must keep keying on the `failure` verdict ' +
        '— which `cancelled` folds into (see collect-results).',
    );
    assert.doesNotMatch(
      condition,
      /overall-status != 'cancelled'|result != 'cancelled'/,
      'remove-merge-label-on-failure must NOT exempt cancellations from label ' +
        'removal. The LS-10091 fix is to re-run the cancelled pipeline so a ' +
        'genuine verdict appears, not to keep the label without one.',
    );
  });
});

/**
 * LS-10091 — the automatic re-run of a cancelled pipeline.
 *
 * A run cannot re-run itself (`rerun-failed-jobs` is rejected while the run is
 * in progress), so this lives in its own `workflow_run`-triggered workflow.
 */
describe('rerun-cancelled-ci.yml — re-run guards (LS-10091)', () => {
  const RERUN_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'workflows',
    'rerun-cancelled-ci.yml',
  );

  function loadRerun() {
    const raw = fs.readFileSync(RERUN_PATH, 'utf8');
    return { raw, parsed: yaml.load(raw) };
  }

  it('triggers only on a completed CI Orchestrator run', () => {
    const { parsed } = loadRerun();
    // `on` parses as boolean `true` in YAML 1.1 unless quoted; js-yaml gives us
    // the key either way, so look it up defensively.
    const on = parsed.on ?? parsed[true];
    assert.deepEqual(on.workflow_run.workflows, [
      'Legacy Sports CI Orchestrator',
    ]);
    assert.deepEqual(on.workflow_run.types, ['completed']);
  });

  it('acts only on a cancelled conclusion, never on a real failure verdict', () => {
    const { parsed } = loadRerun();
    const condition = parsed.jobs.rerun.if;
    assert.match(condition, /conclusion == 'cancelled'/);
    assert.doesNotMatch(
      condition,
      /conclusion == 'failure'/,
      'a `failure` conclusion is a genuine verdict — re-running it would ' +
        'silently retry a SHA that has already been ruled on.',
    );
  });

  it('requests actions:write only for itself, not for ci-orchestrator', () => {
    const { parsed: rerun } = loadRerun();
    assert.equal(rerun.permissions.actions, 'write');

    const { parsed: orchestrator } = loadOrchestrator();
    assert.equal(
      orchestrator.permissions.actions,
      'read',
      'ci-orchestrator.yml must keep `actions: read`. Its workflow-level ' +
        'permissions are inherited by every reusable workflow it calls, so ' +
        'widening them to grant the re-run would hand actions:write to the ' +
        'whole pipeline (LS-10091).',
    );
  });

  it('runs on ubuntu-latest — the self-hosted pool may be the thing that died', () => {
    const { parsed } = loadRerun();
    assert.equal(
      parsed.jobs.rerun['runs-on'],
      'ubuntu-latest',
      'same reasoning as report-runner-shutdown (LS-9710): a job whose reason ' +
        'for existing is that the runner pool shut down cannot be scheduled on ' +
        'that pool.',
    );
  });
});
