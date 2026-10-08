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

  it('keeps the heavy reusable workflows on the self-hosted runner-label', () => {
    // Confirms the LS-9710 fix only narrowed report-runner-shutdown's
    // scheduling, not the jobs that genuinely need the workspace image.
    //
    // LS-10140 moved remove-merge-label-on-failure to ubuntu-latest (it
    // consults the runner-shutdown detector). merge-queue review (2026-10)
    // moved label-pr and restore-merge-label-on-success too: both only make
    // API calls (guarded in bookkeeping-runner-placement.test.mjs). What must
    // stay on the pool is the work that builds and scans.
    const { parsed } = loadOrchestrator();
    const labelExpr = '${{ needs.determine-scope.outputs.runner-label }}';
    for (const jobName of ['ci-pipeline', 'security-scanning']) {
      const job = parsed.jobs[jobName];
      assert.ok(job, `${jobName} job must exist in ci-orchestrator.yml`);
      assert.equal(
        job.with['runner-label'],
        labelExpr,
        `${jobName} should still receive the resolved self-hosted runner-label`,
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

  it('triggers only on a completed run of the orchestrator or a required-status workflow', () => {
    const { parsed } = loadRerun();
    // `on` parses as boolean `true` in YAML 1.1 unless quoted; js-yaml gives us
    // the key either way, so look it up defensively.
    const on = parsed.on ?? parsed[true];
    // LS-10297: the standalone required-status workflows are listed too — a
    // spot-killed job in them never posts its status, and nothing else re-runs it.
    assert.deepEqual(on.workflow_run.workflows, [
      'Legacy Sports CI Orchestrator',
      'Check Migrations Applied',
      'Check Merge Conflicts',
    ]);
    assert.deepEqual(on.workflow_run.types, ['completed']);
  });

  it('every listed workflow name matches a real workflow file (a typo would silently never fire)', () => {
    const { parsed } = loadRerun();
    const on = parsed.on ?? parsed[true];
    const workflowsDir = path.resolve(__dirname, '..', '..', 'workflows');
    const names = fs
      .readdirSync(workflowsDir)
      .filter((f) => f.endsWith('.yml'))
      .map(
        (f) =>
          yaml.load(fs.readFileSync(path.join(workflowsDir, f), 'utf8')).name,
      );
    for (const wanted of on.workflow_run.workflows) {
      assert.ok(
        names.includes(wanted),
        `workflow_run.workflows lists "${wanted}" but no workflow has that name`,
      );
    }
  });

  it('acts on a cancelled conclusion, and on failure only for the orchestrator (LS-10311)', () => {
    const { parsed } = loadRerun();
    const condition = parsed.jobs.rerun.if;
    assert.match(condition, /conclusion == 'cancelled'/);
    // A spot-killed job often concludes `failure`, so the orchestrator's
    // failed runs must be candidates too. They are gated to the orchestrator
    // by name, and the script re-runs one only when CI Gate is pending (no
    // genuine failure), so a real verdict is never retried.
    assert.match(
      condition,
      /conclusion == 'failure' &&\s*github\.event\.workflow_run\.name == 'Legacy Sports CI Orchestrator'/,
    );
  });

  it('passes the run conclusion and CI Gate state to the re-run decision (LS-10311)', () => {
    const { raw } = loadRerun();
    assert.match(raw, /runConclusion: run\.conclusion/);
    assert.match(raw, /gateState,/);
    assert.match(raw, /context === 'CI Gate'/);
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

/**
 * Regression test for LS-10542.
 *
 * On PR #8316 the "🏷️ Label PR" job read "CI: Security" off the PR via
 * pulls.get, then called issues.removeLabel — but an overlapping orchestrator
 * run on the same PR removed the label in between. GitHub answers a DELETE for
 * a label the issue no longer carries with 404 "Label does not exist", and
 * withRetry only retries rate limits, so the job went red. The same
 * read-then-remove race applies to remove-merge-label-on-failure's
 * merge-when-ready strip.
 *
 * These tests execute the github-script bodies against a mocked Octokit whose
 * removeLabel reproduces that 404.
 */
const noop = () => undefined;
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;

function labelNotPresentError() {
  const err = new Error('Label does not exist');
  err.status = 404;
  return err;
}

function mockGithub({ prLabels, removeLabel }) {
  const calls = { addLabels: [], removeLabel: [], createComment: [] };
  return {
    calls,
    github: {
      rest: {
        pulls: {
          get: async () => ({
            data: { labels: prLabels.map((name) => ({ name })) },
          }),
        },
        issues: {
          addLabels: async (args) => {
            calls.addLabels.push(args);
            return { data: [] };
          },
          removeLabel: async (args) => {
            calls.removeLabel.push(args);
            return removeLabel(args);
          },
          createComment: async (args) => {
            calls.createComment.push(args);
            return { data: {} };
          },
        },
      },
    },
  };
}

const mockCore = { info: noop, warning: noop, notice: noop };
const mockContext = {
  repo: { owner: 'bkrupa', repo: 'legacy-sports' },
  issue: { number: 8316 },
  payload: { pull_request: { number: 8316 } },
};
const quietConsole = { log: noop };

function stepScript(jobName, stepName) {
  const { parsed } = loadOrchestrator();
  const step = parsed.jobs[jobName].steps.find((s) => s.name === stepName);
  assert.ok(step, `${jobName} must have a "${stepName}" step`);
  return step.with.script;
}

function runScript(script, { github, securityResult = 'success' }) {
  const body = script.replaceAll(
    '${{ needs.security-scanning.result }}',
    securityResult,
  );
  return new AsyncFunction('github', 'context', 'core', 'console', body)(
    github,
    mockContext,
    mockCore,
    quietConsole,
  );
}

describe('ci-orchestrator.yml — label removal is idempotent under overlapping runs (LS-10542)', () => {
  it('label-pr succeeds when "CI: Security" was already removed by another run', async () => {
    const { github, calls } = mockGithub({
      prLabels: ['CI: Security'],
      removeLabel: async () => {
        throw labelNotPresentError();
      },
    });
    await runScript(stepScript('label-pr', 'Label PR on Security Failure'), {
      github,
      securityResult: 'success',
    });
    assert.equal(calls.removeLabel.length, 1, 'the remove was attempted once');
  });

  it('label-pr still surfaces non-404 removeLabel errors', async () => {
    const { github } = mockGithub({
      prLabels: ['CI: Security'],
      removeLabel: async () => {
        const err = new Error('Server Error');
        err.status = 500;
        throw err;
      },
    });
    await assert.rejects(
      runScript(stepScript('label-pr', 'Label PR on Security Failure'), {
        github,
        securityResult: 'success',
      }),
      /Server Error/,
    );
  });

  it('label-pr still adds the label on a security failure', async () => {
    const { github, calls } = mockGithub({
      prLabels: [],
      removeLabel: async () => ({ data: [] }),
    });
    await runScript(stepScript('label-pr', 'Label PR on Security Failure'), {
      github,
      securityResult: 'failure',
    });
    assert.deepEqual(
      calls.addLabels.map((c) => c.labels),
      [['CI: Security']],
    );
  });

  it('remove-merge-label-on-failure succeeds, without a duplicate comment, when merge-when-ready was already removed', async () => {
    const { github, calls } = mockGithub({
      prLabels: ['merge-when-ready'],
      removeLabel: async () => {
        throw labelNotPresentError();
      },
    });
    await runScript(
      stepScript(
        'remove-merge-label-on-failure',
        'Remove merge-when-ready label',
      ),
      { github },
    );
    assert.equal(calls.removeLabel.length, 1, 'the remove was attempted once');
    assert.equal(
      calls.createComment.length,
      0,
      'the run that actually removed the label already posted the failure comment',
    );
  });

  it('remove-merge-label-on-failure still comments after a successful removal', async () => {
    const { github, calls } = mockGithub({
      prLabels: ['merge-when-ready'],
      removeLabel: async () => ({ data: [] }),
    });
    await runScript(
      stepScript(
        'remove-merge-label-on-failure',
        'Remove merge-when-ready label',
      ),
      { github },
    );
    assert.equal(calls.createComment.length, 1);
  });
});

/**
 * LS-10297 — the runner-shutdown classifier must not be able to fail the
 * cleanup jobs that consume it.
 *
 * On PR #8181 the installation's API budget was exhausted; the composite
 * action's first call (`listJobsForWorkflowRun`) threw a 403 and both "Report
 * Runner Shutdown" and "Remove Merge Label on Failure" went red instead of
 * running. Unproven must read as "not runner churn" (fail-safe), not as a crash.
 */
describe('detect-runner-shutdown action — API errors fail safe (LS-10297)', () => {
  const ACTION_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'actions',
    'detect-runner-shutdown',
    'action.yml',
  );

  function loadScript() {
    const parsed = yaml.load(fs.readFileSync(ACTION_PATH, 'utf8'));
    const step = parsed.runs.steps.find((s) => s.id === 'detect');
    return step.with.script;
  }

  async function run(github) {
    const outputs = {};
    const warnings = [];
    const core = {
      info: () => undefined,
      warning: (m) => warnings.push(m),
      setOutput: (k, v) => {
        outputs[k] = v;
      },
    };
    const AsyncFunction = Object.getPrototypeOf(
      async () => undefined,
    ).constructor;
    const fn = new AsyncFunction(
      'github',
      'context',
      'core',
      'require',
      'process',
      loadScript(),
    );
    await fn(
      github,
      { repo: { owner: 'o', repo: 'r' }, runId: 1 },
      core,
      () => require('../runner-cancellation.js'),
      { env: { DETECT_TOKEN: 't', DETECT_RUN_ID: '' } },
    );
    return { outputs, warnings };
  }

  it('does not throw when listing jobs is rate-limited, and reports no shutdown', async () => {
    const rateLimited = Object.assign(
      new Error('API rate limit exceeded for installation'),
      {
        status: 403,
      },
    );
    const { outputs, warnings } = await run({
      rest: {
        actions: {
          listJobsForWorkflowRun: async () => {
            throw rateLimited;
          },
        },
      },
    });
    assert.equal(outputs['shutdown-detected'], 'false');
    assert.equal(outputs['job-names'], '');
    assert.match(warnings.join('\n'), /rate limit exceeded/);
  });

  it('NEGATIVE CONTROL: a run with no failed jobs still classifies normally (no shutdown)', async () => {
    const { outputs } = await run({
      rest: {
        actions: {
          listJobsForWorkflowRun: async () => ({
            data: { jobs: [{ id: 1, name: 'ok', conclusion: 'success' }] },
          }),
        },
      },
    });
    assert.equal(outputs['shutdown-detected'], 'false');
  });
});

/**
 * merge-queue review (2026-10): check-prior-success keys on CI Gate alone.
 *
 * It used to require every _commitStatus context in ruleset.json to be
 * `success`. The pipeline only produces CI Gate, so a migration PR (red
 * "Verify All Migrations Applied") or a conflicting PR re-ran full CI + E2E on
 * every approval, and a flake in that duplicate run let
 * remove-merge-label-on-failure strip merge-when-ready.
 *
 * These tests run the step's github-script body against a mocked Octokit.
 */
describe('ci-orchestrator.yml — check-prior-success decides on CI Gate (merge-queue review 2026-10)', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
  const HEAD = 'a'.repeat(40);

  async function runGuard({
    eventName,
    statuses,
    checkRuns = [],
    siblingRuns = [],
  }) {
    const script = stepScript(
      'determine-scope',
      '🔍 Check for prior CI success',
    );
    const outputs = {};
    const core = {
      info: noop,
      warning: noop,
      error: noop,
      setOutput: (k, v) => {
        outputs[k] = v;
      },
    };
    const listWorkflowRuns = async () => ({
      data: { workflow_runs: siblingRuns },
    });
    const github = {
      rest: {
        pulls: { get: async () => ({ data: { head: { sha: HEAD } } }) },
        checks: {
          listForRef: async () => ({ data: { check_runs: checkRuns } }),
        },
        repos: {
          listCommitStatusesForRef: async () => ({
            data: Object.entries(statuses).map(([ctx, state]) => ({
              context: ctx,
              state,
            })),
          }),
        },
        actions: { listWorkflowRuns },
      },
      paginate: async () => siblingRuns,
    };
    const context = {
      eventName,
      sha: HEAD,
      runId: 1,
      repo: { owner: 'bkrupa', repo: 'legacy-sports' },
      payload:
        eventName === 'pull_request_review'
          ? { pull_request: { number: 8400, head: { sha: HEAD } } }
          : {},
    };
    const saved = { ...process.env };
    process.env.GITHUB_WORKSPACE = REPO_ROOT;
    process.env.RESOLVED_PR_NUMBER = '8400';
    process.env.RESOLVED_HEAD_SHA = HEAD;
    try {
      await new AsyncFunction('github', 'context', 'core', 'require', script)(
        github,
        context,
        core,
        require,
      );
    } finally {
      process.env = saved;
    }
    return outputs['ci-already-passed'];
  }

  const REVIEW = 'pull_request_review';
  const DISPATCH = 'workflow_dispatch';
  const otherContextsRed = {
    'bot-review': 'success',
    'No Merge Conflicts': 'failure',
    'Verify All Migrations Applied': 'failure',
  };

  it('skips an approval re-run when CI Gate is success even though other required contexts are red', async () => {
    assert.equal(
      await runGuard({
        eventName: REVIEW,
        statuses: { ...otherContextsRed, 'CI Gate': 'success' },
      }),
      'true',
    );
  });

  it('skips an approval re-run when CI Gate is already failure on the live head', async () => {
    assert.equal(
      await runGuard({
        eventName: REVIEW,
        statuses: { ...otherContextsRed, 'CI Gate': 'failure' },
      }),
      'true',
    );
  });

  it('NEGATIVE CONTROL: ci:run (workflow_dispatch) still re-runs a red CI Gate', async () => {
    assert.equal(
      await runGuard({
        eventName: DISPATCH,
        statuses: { 'CI Gate': 'failure' },
      }),
      'false',
    );
  });

  it('NEGATIVE CONTROL: a pending CI Gate with nothing in flight still runs CI', async () => {
    assert.equal(
      await runGuard({ eventName: REVIEW, statuses: { 'CI Gate': 'pending' } }),
      'false',
    );
  });

  it('keeps the in-flight check: a pending CI Gate with an active CI Pipeline job skips', async () => {
    assert.equal(
      await runGuard({
        eventName: REVIEW,
        statuses: { 'CI Gate': 'pending' },
        checkRuns: [
          {
            name: '🚀 CI Pipeline / lint',
            status: 'in_progress',
            conclusion: null,
          },
        ],
      }),
      'true',
    );
  });

  it('keeps the LS-9887 sibling check: a queued push-run on the SHA skips', async () => {
    assert.equal(
      await runGuard({
        eventName: REVIEW,
        statuses: {},
        siblingRuns: [{ id: 2, status: 'queued', event: 'pull_request' }],
      }),
      'true',
    );
  });
});

describe('ci-orchestrator.yml — scans skip with the pipeline on a decided SHA (merge-queue review 2026-10)', () => {
  it('gates security-scanning and label-pr on ci-already-passed like ci-pipeline', () => {
    const { parsed } = loadOrchestrator();
    for (const jobName of ['ci-pipeline', 'security-scanning', 'label-pr']) {
      assert.match(
        parsed.jobs[jobName].if,
        /needs\.determine-scope\.outputs\.ci-already-passed != 'true'/,
        `${jobName} must not re-run on an approval of an already-decided SHA`,
      );
    }
  });

  it('restore-merge-label-on-success no longer dispatches merge-queue.yml itself', () => {
    const script = stepScript(
      'restore-merge-label-on-success',
      'Restore merge-when-ready label if bot approval is active',
    );
    assert.doesNotMatch(
      script,
      /dispatches/,
      "merge-queue.yml's workflow_run trigger already fires on this run's completion",
    );
  });
});
