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
  trackWaitingSince,
  watchRun,
  MAX_CONSECUTIVE_API_FAILURES,
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

// Every waiting job in `jobs` was first seen waiting at T0 and has now waited
// `ageMinutes`.
function decide(jobs, ageMinutes, overrides = {}) {
  const all = [SELF, ...jobs];
  return decideWatchdogAction({
    jobs: all,
    waitingSinceMs: trackWaitingSince({}, all, T0),
    nowMs: T0 + ageMinutes * MIN,
    ...overrides,
  });
}

// Drives watchRun against a fake clock: `sleep` advances it, and `snapshot`
// maps minutes-since-arm to the job list GitHub would return at that moment.
async function watch(snapshot, overrides = {}) {
  let nowMs = T0;
  const logs = [];
  const decision = await watchRun({
    listJobs: async () => [SELF, ...snapshot((nowMs - T0) / MIN)],
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
    log: (line) => logs.push(line),
    warn: (line) => logs.push(line),
    ...overrides,
  });
  return { decision, logs, elapsedMinutes: (nowMs - T0) / MIN };
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
      waitingSinceMs: { [ANDROID]: T0 },
      nowMs: T0 + 11 * MIN,
      deadlineMinutes: 10,
      selfJobName: 'Guard',
      terminalJobName: 'Wrap Up',
    });
    assert.equal(decision.action, ACTION_CANCEL);
    assert.ok(decision.ageMinutes >= 11);
  });

  it('clamps a clock skew that puts "now" before the first sighting to age 0', () => {
    const decision = decide([job(ANDROID, 'queued')], -5);
    assert.equal(decision.ageMinutes, 0);
    assert.equal(decision.action, ACTION_WAIT);
  });
});

// LS-10365. Run 36817980251 was created 05:03Z, sat pending behind the
// `deploy-main` group until 16:20Z, and was cancelled on the watchdog's first
// poll for "waiting 676.8 min": the baseline was the run's `run_started_at`,
// which GitHub stamps at run creation, not at release from the group.
describe('watchRun — the wait is timed from what the watchdog itself observes (LS-10365)', () => {
  const DETECT = 'Detect Deploy Targets';
  const ELEVEN_HOURS_AGO = new Date(T0 - 11 * 60 * MIN).toISOString();
  // What the API reports for a job of a run that was created 11 h ago and
  // released from the concurrency group a minute before the watchdog armed.
  const staleQueued = (name) => ({
    ...job(name, 'queued'),
    created_at: ELEVEN_HOURS_AGO,
    started_at: ELEVEN_HOURS_AGO,
  });

  it('does not cancel a run created 11 h ago whose jobs only just became runnable', async () => {
    const { decision, logs } = await watch((minute) => {
      if (minute < 1) return [staleQueued(DETECT)];
      if (minute < 3) return [job(DETECT, 'in_progress')];
      return [
        job(DETECT, 'completed', 'success'),
        job(DEFAULT_TERMINAL_JOB_NAME, 'completed', 'success'),
      ];
    });
    assert.equal(decision.action, ACTION_DONE);
    assert.ok(
      !logs.some((line) => line.includes(`${ACTION_CANCEL}:`)),
      `no poll may decide cancel:\n${logs.join('\n')}`,
    );
    assert.match(logs[0], /^\[0\.0 min\] wait: .*for 0\.0 min/);
  });

  it('cancels once a job has been queued for 31 min since the watchdog armed with nothing in progress', async () => {
    const decision = decide([staleQueued(DETECT)], 31);
    assert.equal(decision.action, ACTION_CANCEL);
    assert.deepEqual(decision.stuckJobs, [DETECT]);
    assert.equal(decision.ageMinutes, 31);
  });

  it('cancels at the default 30 min deadline, not before', async () => {
    const { decision, elapsedMinutes } = await watch(() => [
      job(ANDROID, 'queued'),
    ]);
    assert.equal(decision.action, ACTION_CANCEL);
    assert.equal(elapsedMinutes, DEFAULT_DEADLINE_MINUTES);
  });

  it('gives a job dispatched late in a long deploy its own deadline instead of the age of the run', async () => {
    // Web deploys for 40 min, then Rollup Status is dispatched and queues.
    // Under a run-age baseline that first queued poll would cancel.
    const { decision, elapsedMinutes } = await watch((minute) =>
      minute < 40
        ? [job('Deploy Web / Build and Deploy', 'in_progress')]
        : [
            job('Deploy Web / Build and Deploy', 'completed', 'success'),
            job(DEFAULT_TERMINAL_JOB_NAME, 'queued'),
          ],
    );
    assert.equal(decision.action, ACTION_CANCEL);
    assert.deepEqual(decision.stuckJobs, [DEFAULT_TERMINAL_JOB_NAME]);
    assert.equal(elapsedMinutes, 40 + DEFAULT_DEADLINE_MINUTES);
  });

  it('still cancels the LS-10328 shape: a child queued from the start while siblings run and finish', async () => {
    const { decision, elapsedMinutes } = await watch((minute) => [
      job(ANDROID, 'queued'),
      minute < 12
        ? job('Deploy Web / Build and Deploy', 'in_progress')
        : job('Deploy Web / Build and Deploy', 'completed', 'success'),
    ]);
    assert.equal(decision.action, ACTION_CANCEL);
    assert.deepEqual(decision.stuckJobs, [ANDROID]);
    assert.equal(elapsedMinutes, DEFAULT_DEADLINE_MINUTES);
  });

  it('fails open (null, no cancel) when the jobs API keeps failing', async () => {
    let calls = 0;
    const { decision } = await watch(() => [], {
      listJobs: async () => {
        calls += 1;
        throw new Error('HTTP 503');
      },
    });
    assert.equal(decision, null);
    assert.equal(calls, MAX_CONSECUTIVE_API_FAILURES);
  });
});

describe('trackWaitingSince', () => {
  it('keeps the first sighting across polls and ignores API timestamps and the watchdog itself', () => {
    const jobs = [
      SELF,
      { ...job(ANDROID, 'queued'), created_at: '2020-01-01T00:00:00Z' },
    ];
    const first = trackWaitingSince({}, jobs, T0);
    assert.deepEqual(first, { [ANDROID]: T0 });
    assert.deepEqual(trackWaitingSince(first, jobs, T0 + 5 * MIN), first);
  });

  it('restarts the clock for a job that got a runner and later waits again', () => {
    const first = trackWaitingSince({}, [job(ANDROID, 'queued')], T0);
    const running = trackWaitingSince(
      first,
      [job(ANDROID, 'in_progress')],
      T0 + MIN,
    );
    assert.deepEqual(running, {});
    assert.deepEqual(
      trackWaitingSince(running, [job(ANDROID, 'queued')], T0 + 2 * MIN),
      { [ANDROID]: T0 + 2 * MIN },
    );
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

  it('force-cancels after the cancel if the run cannot finish, surviving its own cancellation, and never while a job is in progress (LS-10365)', () => {
    // A plain cancel still dispatches `if: always()` Rollup Status onto the
    // self-hosted pool; if that pool is the wedged one the run never reaches
    // a terminal state and `deploy-main` stays held.
    const steps = watchdog.steps;
    const cancelIdx = steps.findIndex((s) => s.id === 'cancel');
    const forceIdx = steps.findIndex((s) => s.id === 'force-cancel');
    assert.ok(forceIdx > cancelIdx, 'force-cancel must follow the cancel');
    const force = steps[forceIdx];
    assert.match(String(force.if), /always\(\)/);
    assert.match(
      String(force.if),
      /steps\.watch\.outputs\.cancelled == 'true'/,
    );
    assert.equal(force.env.SELF_JOB_NAME, DEFAULT_JOB_NAME);
    assert.match(
      force.run,
      /actions\/runs\/\$\{?GITHUB_RUN_ID\}?\/force-cancel/,
    );
    assert.ok(
      force.run.indexOf('in_progress') < force.run.indexOf('/force-cancel'),
      'the in-progress guard must come before the force-cancel call',
    );
  });

  it('is not a dependency of Rollup Status or any other job (that would deadlock: rollup waits on watchdog waits on rollup)', () => {
    const rollup = parsed.jobs['rollup-status'];
    assert.equal(rollup.name, DEFAULT_TERMINAL_JOB_NAME);
    // `always()`, plus the LS-10964 Supersede Gate clause: a superseded run
    // skips Rollup Status, and a skipped job still reports `completed`.
    assert.match(rollup.if, /^always\(\)/);
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
