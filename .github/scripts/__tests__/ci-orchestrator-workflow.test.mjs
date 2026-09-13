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
    //
    // LS-10140 moved remove-merge-label-on-failure out of this set: it now
    // consults the same runner-shutdown detector, so it inherits the same
    // requirement to be schedulable while the self-hosted pool is down. See
    // its own assertion in the LS-10140 describe block below.
    const { parsed } = loadOrchestrator();
    const fallbackExpr =
      "${{ needs.determine-scope.outputs.runner-label || 'ubuntu-latest' }}";
    for (const jobName of ['label-pr', 'restore-merge-label-on-success']) {
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
    // LS-10140 split the single `failure || cancelled` branch into two so the
    // two events can be told apart downstream (cancelled-steps /
    // cancellation-only outputs), but the VERDICT must not move: a cancelled
    // critical step still sets OVERALL_STATUS=failure. Asserted on the
    // cancelled branch's body rather than the old combined condition, so this
    // control survives the refactor it is meant to police.
    const raw = fs.readFileSync(COLLECT_RESULTS_PATH, 'utf8');
    const cancelledBranch = raw.slice(
      raw.indexOf('if [ "$STEP_RESULT" = "cancelled" ]; then'),
      raw.indexOf('elif [ "$STEP_RESULT" = "failure" ]; then'),
    );
    assert.ok(
      cancelledBranch.length > 0,
      'collect-results must still have an explicit `cancelled` branch',
    );
    assert.match(
      cancelledBranch,
      /OVERALL_STATUS="failure"/,
      'a cancelled critical step must keep folding into OVERALL_STATUS ' +
        '"failure" — this is the single point that makes a cancelled pipeline ' +
        'not-green. Resolving it to "success" here would let an unverified ' +
        'SHA read as green (LS-10091).',
    );
    assert.equal(
      (raw.match(/OVERALL_STATUS="success"/g) || []).length,
      1,
      'OVERALL_STATUS may only be set to "success" once — at initialisation. ' +
        'A second assignment would mean some branch resolves a not-green ' +
        'pipeline back to success.',
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

/**
 * LS-10140 — the runner-shutdown signal must reach the ACTION, not just a
 * comment.
 *
 * The repo already detected a runner-shutdown cancellation correctly and
 * posted "this is not caused by your code" on the PR. But that job ran after,
 * and independently of, the label-strip and the gate — so the human-facing
 * signal and the machine-facing decisions disagreed, and a PR that was green
 * throughout lost `merge-when-ready` to a runner that died.
 *
 * These tests pin the wiring that makes them agree, and the boundaries that
 * keep it from becoming a blanket cancellation exemption (which LS-10091's
 * controls above still forbid).
 */
describe('ci-orchestrator.yml — the label strip consults runner-shutdown detection (LS-10140)', () => {
  it('remove-merge-label-on-failure runs the shared detect-runner-shutdown action', () => {
    const { parsed } = loadOrchestrator();
    const steps = parsed.jobs['remove-merge-label-on-failure'].steps;
    const detect = steps.find(
      (s) => s.uses === './.github/actions/detect-runner-shutdown',
    );
    assert.ok(
      detect,
      'the label-strip job must classify the cancellation with the SAME ' +
        'composite action report-runner-shutdown uses — a second, divergent ' +
        'copy of the rule is how detection and action drifted apart in the ' +
        'first place',
    );
    assert.equal(
      detect.id,
      'detect',
      'the detect step needs a stable id for the strip step to gate on',
    );
    assert.ok(
      steps.some((s) => s.uses && s.uses.startsWith('actions/checkout@')),
      'the composite action is a local path — the job has to check out the repo',
    );
  });

  it('the strip step is skipped ONLY for a runner-attributable shutdown', () => {
    const { parsed } = loadOrchestrator();
    const steps = parsed.jobs['remove-merge-label-on-failure'].steps;
    const strip = steps.find((s) => s.name === 'Remove merge-when-ready label');
    assert.ok(strip, 'the strip step must still exist');
    assert.match(
      strip.if,
      /steps\.detect\.outputs\.shutdown-detected != 'true'/,
      'every failure that is NOT an attributed runner shutdown — a genuine ' +
        'break, a deliberate cancel, an unattributable one — must keep ' +
        'stripping the label (LS-10091)',
    );
  });

  it('NEGATIVE CONTROL: the job gate still keys on the failure verdict, with no cancellation exemption', () => {
    // The fix must not be "exempt cancellations from the label strip". The
    // job-level `if:` is unchanged; only an ATTRIBUTED runner shutdown, proven
    // from the run's own job logs, skips the strip step.
    const { parsed } = loadOrchestrator();
    const condition = parsed.jobs['remove-merge-label-on-failure'].if;
    assert.match(
      condition,
      /needs\.ci-pipeline\.outputs\.overall-status == 'failure'/,
    );
    assert.doesNotMatch(
      condition,
      /overall-status != 'cancelled'|result != 'cancelled'/,
      'a blanket cancellation exemption at the job level would let every ' +
        'unverified SHA keep merge-when-ready (LS-10091)',
    );
  });

  it('the job is schedulable while the self-hosted pool is down (LS-9710 rationale)', () => {
    const { parsed } = loadOrchestrator();
    const job = parsed.jobs['remove-merge-label-on-failure'];
    assert.equal(
      job['runs-on'],
      'ubuntu-latest',
      'a job that asks "did the runner pool die?" must not itself queue for ' +
        "that pool — and must not hold this run's concurrency slot waiting " +
        'for a runner that will never arrive (LS-9710)',
    );
  });

  it('documents why keeping the label is safe — the pending CI Gate, not the label, blocks the merge', () => {
    const { raw } = loadOrchestrator();
    const jobStart = raw.indexOf('remove-merge-label-on-failure:');
    const jobEnd = raw.indexOf('report-runner-shutdown:');
    const block = raw.slice(jobStart, jobEnd);
    assert.match(
      block,
      /LS-10140/,
      'the exemption needs its ticket reference for future readers',
    );
    assert.match(
      block,
      /CI Gate/,
      'the comment must name the mechanism that still blocks the merge, or a ' +
        'future reader will read this as "cancelled PRs can merge"',
    );
  });
});

/**
 * LS-10140 regression — the seed job's sparse checkout must carry ci-gate.js's
 * whole require graph.
 *
 * `seed-ci-gate` checks out a SINGLE file (`sparse-checkout:
 * .github/scripts/ci-gate.js`) to beat the runner queue to the open→merge
 * window (LS-9543). That makes any new top-level `require('./x.js')` in
 * ci-gate.js an invisible dependency on a file the job does not have: the
 * module loads, the nested require throws MODULE_NOT_FOUND, and the seed job
 * fails — which is exactly what happened on PR #8000 (run 34786055610) when
 * ci-gate.js started requiring runner-cancellation.js.
 *
 * Unit tests import ci-gate.js from a full checkout, so nothing else catches
 * this. Asserted here rather than by adding a `catch` around the require,
 * because the seed job genuinely needs the file — it just needs to check it
 * out.
 */
describe('ci-orchestrator.yml — seed-ci-gate sparse checkout covers ci-gate.js deps (LS-10140)', () => {
  it('every relative require in ci-gate.js is in the sparse-checkout list', () => {
    const { parsed } = loadOrchestrator();
    const checkoutStep = parsed.jobs['seed-ci-gate'].steps.find(
      (s) => s.uses && s.uses.startsWith('actions/checkout@'),
    );
    assert.ok(checkoutStep, 'seed-ci-gate must check the repo out');
    const sparse = checkoutStep.with['sparse-checkout'];
    assert.ok(sparse, 'seed-ci-gate must keep its single-file sparse checkout');

    const ciGate = fs.readFileSync(
      path.resolve(__dirname, '..', 'ci-gate.js'),
      'utf8',
    );
    const required = [...ciGate.matchAll(/require\('\.\/([^']+)'\)/g)].map(
      (m) => m[1],
    );

    for (const dep of required) {
      assert.ok(
        sparse.includes(`.github/scripts/${dep}`),
        `ci-gate.js requires "./${dep}", but seed-ci-gate's sparse-checkout ` +
          'does not fetch it — the seed job would fail with MODULE_NOT_FOUND. ' +
          `Add ".github/scripts/${dep}" to the sparse-checkout list.`,
      );
    }
  });
});
