/**
 * Tests for deploy-watchdog.js and the `Deploy Watchdog` job in deploy.yml
 * (LS-10328).
 *
 * The 2026-09-29 incident: `Build Android App / Build Android APK` queued for
 * 1440 min with no runner, the umbrella ran to GitHub's cap, and 58 later
 * push-to-main Deploys were cancelled while pending behind it in the
 * `deploy-main` concurrency group. Nothing shipped for ~26 h.
 *
 * Two halves:
 *  - decideWatchdogAction: the pure decision — cancel ONLY when the run is
 *    past the deadline, something is still waiting for a runner, and nothing
 *    is in progress (so a terraform apply is never torn down mid-flight).
 *  - deploy.yml shape: the watchdog job must be schedulable when the
 *    self-hosted pools are not (GitHub-hosted), independent of every child,
 *    unable to fail the run, and wired so Rollup Status never waits on it.
 *
 * Run via: node --test .github/scripts/__tests__/deploy-watchdog.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');

const {
  decideWatchdogAction,
  ACTION_DONE,
  ACTION_WAIT,
  ACTION_CANCEL,
  DEFAULT_DEADLINE_MINUTES,
  DEFAULT_JOB_NAME,
  DEFAULT_TERMINAL_JOB_NAME,
} = require('../deploy-watchdog.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'workflows',
  'deploy.yml',
);

function loadDeploy() {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  return { raw, parsed: yaml.load(raw) };
}

const MIN = 60_000;
const T0 = Date.parse('2026-09-29T01:49:00Z');

const job = (name, status, conclusion = null) => ({ name, status, conclusion });
const SELF = job(DEFAULT_JOB_NAME, 'in_progress');
const ANDROID = 'Build Android App / Build Android APK';
const APPLY = 'Apply Lambda Infrastructure / Apply Lambda Infrastructure';

function decide(jobs, ageMinutes, overrides = {}) {
  return decideWatchdogAction({
    jobs: [SELF, ...jobs],
    runStartedMs: T0,
    nowMs: T0 + ageMinutes * MIN,
    ...overrides,
  });
}

describe('decideWatchdogAction — the LS-10328 incident shape', () => {
  it('cancels a run whose only remaining child has waited past the deadline with nothing running', () => {
    const decision = decide(
      [
        job('Detect Deploy Targets', 'completed', 'success'),
        job('Deploy Web / Build and Deploy', 'completed', 'success'),
        job(ANDROID, 'queued'),
      ],
      DEFAULT_DEADLINE_MINUTES + 1,
    );
    assert.equal(decision.action, ACTION_CANCEL);
    assert.deepEqual(decision.waitingJobs, [ANDROID]);
    assert.deepEqual(decision.runningJobs, []);
  });

  it('keeps waiting while the same child is under the deadline', () => {
    const decision = decide(
      [
        job('Detect Deploy Targets', 'completed', 'success'),
        job(ANDROID, 'queued'),
      ],
      DEFAULT_DEADLINE_MINUTES - 1,
    );
    assert.equal(decision.action, ACTION_WAIT);
  });

  it('never cancels while a terraform apply is in progress, however old the run is', () => {
    const decision = decide(
      [job(APPLY, 'in_progress'), job(ANDROID, 'queued')],
      DEFAULT_DEADLINE_MINUTES * 4,
    );
    assert.equal(decision.action, ACTION_WAIT);
    assert.deepEqual(decision.runningJobs, [APPLY]);
    assert.match(decision.reason, /mid-flight/);
  });

  it('never cancels while ANY job is in progress — a running job has a runner and its own timeout', () => {
    const decision = decide(
      [
        job('Deploy Web / Build and Deploy', 'in_progress'),
        job(ANDROID, 'queued'),
      ],
      DEFAULT_DEADLINE_MINUTES + 30,
    );
    assert.equal(decision.action, ACTION_WAIT);
  });

  it('treats every non-running, non-terminal status as "waiting for a runner"', () => {
    for (const status of ['queued', 'waiting', 'pending', 'requested']) {
      const decision = decide([job(ANDROID, status)], DEFAULT_DEADLINE_MINUTES);
      assert.equal(decision.action, ACTION_CANCEL, `status=${status}`);
    }
  });
});

describe('decideWatchdogAction — completion and dispatch gaps', () => {
  it('is done once the terminal job (Rollup Status) has completed', () => {
    const decision = decide(
      [
        job('Detect Deploy Targets', 'completed', 'success'),
        job(DEFAULT_TERMINAL_JOB_NAME, 'completed', 'success'),
      ],
      12,
    );
    assert.equal(decision.action, ACTION_DONE);
  });

  it('is done on the terminal job even when it concluded failure or was skipped', () => {
    for (const conclusion of ['failure', 'skipped', 'cancelled']) {
      const decision = decide(
        [job(DEFAULT_TERMINAL_JOB_NAME, 'completed', conclusion)],
        5,
      );
      assert.equal(decision.action, ACTION_DONE, `conclusion=${conclusion}`);
    }
  });

  it('waits (does not exit or cancel) in the gap between a job completing and its needs-dependants being dispatched', () => {
    // Right after Detect Deploy Targets completes, no child job exists yet —
    // GitHub only creates a needs-gated job once its dependencies finish.
    // Exiting here would leave the rest of the deploy unguarded; cancelling
    // would kill a healthy deploy.
    const decision = decide(
      [job('Detect Deploy Targets', 'completed', 'success')],
      DEFAULT_DEADLINE_MINUTES + 5,
    );
    assert.equal(decision.action, ACTION_WAIT);
    assert.deepEqual(decision.waitingJobs, []);
  });

  it('ignores its own job when counting running work', () => {
    // The watchdog is always in_progress while it polls; if it counted itself
    // it could never reach `cancel`.
    const decision = decide([job(ANDROID, 'queued')], DEFAULT_DEADLINE_MINUTES);
    assert.equal(decision.action, ACTION_CANCEL);
  });

  it('honours a custom deadline and job names', () => {
    const decision = decideWatchdogAction({
      jobs: [job('Guard', 'in_progress'), job(ANDROID, 'queued')],
      runStartedMs: T0,
      nowMs: T0 + 11 * MIN,
      deadlineMinutes: 10,
      selfJobName: 'Guard',
      terminalJobName: 'Wrap Up',
    });
    assert.equal(decision.action, ACTION_CANCEL);
    assert.ok(decision.ageMinutes >= 11);
  });

  it('clamps a clock skew that puts "now" before the run start to age 0', () => {
    const decision = decide([job(ANDROID, 'queued')], -5);
    assert.equal(decision.ageMinutes, 0);
    assert.equal(decision.action, ACTION_WAIT);
  });
});

describe('deploy.yml — Deploy Watchdog job shape (LS-10328)', () => {
  const { parsed, raw } = loadDeploy();
  const watchdog = parsed.jobs.watchdog;

  it('exists and is named exactly what the script expects to ignore', () => {
    assert.ok(watchdog, 'a `watchdog` job must exist in deploy.yml');
    assert.equal(watchdog.name, DEFAULT_JOB_NAME);
  });

  it('runs on a GitHub-hosted runner, not the self-hosted pool that may be the thing that is wedged', () => {
    // Same reasoning as LS-9710's report-runner-shutdown job: a guard against
    // "no runner ever picks the job up" cannot itself depend on that pool.
    assert.equal(watchdog['runs-on'], 'ubuntu-latest');
  });

  it('has no `needs` — it must start with the run, not after any child', () => {
    assert.equal(watchdog.needs, undefined);
  });

  it('can never fail the run (continue-on-error) and is bounded by its own timeout', () => {
    assert.equal(watchdog['continue-on-error'], true);
    assert.ok(
      Number.isInteger(watchdog['timeout-minutes']) &&
        watchdog['timeout-minutes'] > DEFAULT_DEADLINE_MINUTES,
      'timeout-minutes must exceed the deadline so the watchdog is alive to act on it',
    );
  });

  it('holds actions: write (to cancel the run) and nothing broader than it needs', () => {
    assert.equal(watchdog.permissions?.actions, 'write');
    assert.equal(watchdog.permissions?.contents, 'read');
    assert.deepEqual(Object.keys(watchdog.permissions).sort(), [
      'actions',
      'contents',
    ]);
  });

  it('pins the deadline env to the ~30 min acceptance criterion', () => {
    const watchStep = watchdog.steps.find((s) => s.id === 'watch');
    assert.ok(watchStep, 'a step with id `watch` must run the script');
    assert.match(watchStep.run, /deploy-watchdog\.js/);
    assert.equal(
      String(watchStep.env.WATCHDOG_DEADLINE_MINUTES),
      String(DEFAULT_DEADLINE_MINUTES),
    );
    assert.equal(watchStep.env.WATCHDOG_JOB_NAME, DEFAULT_JOB_NAME);
    assert.equal(
      watchStep.env.WATCHDOG_TERMINAL_JOB_NAME,
      DEFAULT_TERMINAL_JOB_NAME,
    );
  });

  it('notifies Discord BEFORE cancelling, and both steps are gated on the script saying cancel', () => {
    const steps = watchdog.steps;
    const notifyIdx = steps.findIndex((s) =>
      String(s.uses ?? '').includes('discord-notify'),
    );
    const cancelIdx = steps.findIndex((s) => s.id === 'cancel');
    assert.ok(notifyIdx >= 0, 'a discord-notify step must exist');
    assert.ok(cancelIdx >= 0, 'a step with id `cancel` must exist');
    assert.ok(
      notifyIdx < cancelIdx,
      'Discord must be notified before the cancel — a cancelled run may not reach Rollup Status',
    );
    for (const step of [steps[notifyIdx], steps[cancelIdx]]) {
      assert.match(
        String(step.if),
        /steps\.watch\.outputs\.cancelled == 'true'/,
        `${step.name} must be gated on the watch step's cancelled output`,
      );
    }
    assert.match(
      steps[cancelIdx].run,
      /actions\/runs\/\$\{?GITHUB_RUN_ID\}?\/cancel/,
      "the cancel step must POST to this run's /cancel endpoint",
    );
  });

  it('is not a dependency of Rollup Status or any other job (that would deadlock: rollup waits on watchdog waits on rollup)', () => {
    const rollup = parsed.jobs['rollup-status'];
    assert.equal(rollup.name, DEFAULT_TERMINAL_JOB_NAME);
    assert.equal(rollup.if, 'always()');
    for (const [id, def] of Object.entries(parsed.jobs)) {
      const needs = [].concat(def.needs ?? []);
      assert.ok(
        !needs.includes('watchdog'),
        `${id} must not need the watchdog job`,
      );
    }
  });

  it('keeps deploy-main serialised with cancel-in-progress: false (the watchdog is the bound, not blanket cancellation)', () => {
    assert.equal(parsed.concurrency.group, 'deploy-main');
    assert.equal(parsed.concurrency['cancel-in-progress'], false);
  });

  it('documents the decision in the workflow header', () => {
    assert.match(raw, /LS-10328/);
    assert.match(raw, /Deploy Watchdog/);
  });
});
