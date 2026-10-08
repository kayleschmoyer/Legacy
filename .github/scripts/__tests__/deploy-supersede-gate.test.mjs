/**
 * Tests for the `Supersede Gate` job in deploy.yml (LS-10964).
 *
 * The batched merge queue lands a tested batch as N squash merges seconds
 * apart, so N Deploy runs start. Only the last commit equals the tested tree.
 * The gate waits a settle window and skips a push-triggered run once main has
 * moved on and a newer Deploy run is pending.
 *
 * Skipping is only safe because nothing downstream diffs the pushed range
 * (`github.event.before..github.sha`): targets are decided against per-target
 * last-deployed markers (LS-10369), so the final run ships every skipped
 * commit. The wiring tests below pin that assumption.
 *
 * The behaviour tests run the step's real bash with a stub `gh` (which applies
 * `--jq` through jq). They are skipped where bash or jq is missing.
 *
 * Run via: node --test .github/scripts/__tests__/deploy-supersede-gate.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

function readWorkflow(name) {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8');
}

const deploy = yaml.load(readWorkflow('deploy.yml'));
const gate = deploy.jobs['supersede-gate'];
const gateStep = gate?.steps?.find((s) => s.id === 'check');

const CHILDREN = [
  'upload-lambdas',
  'apply-lambda-infrastructure',
  'deploy-web',
  'build-android',
  'deploy-storybook',
];

function needsOf(job) {
  const { needs } = deploy.jobs[job];
  return Array.isArray(needs) ? needs : [needs];
}

describe('deploy.yml — Supersede Gate job shape (LS-10964)', () => {
  it('exists and runs on a GitHub-hosted runner', () => {
    assert.ok(gate, 'a `supersede-gate` job must exist in deploy.yml');
    assert.equal(gate['runs-on'], 'ubuntu-latest');
    assert.ok(Number.isInteger(gate['timeout-minutes']));
  });

  it('runs for push events only — a workflow_dispatch is never delayed or skipped', () => {
    assert.equal(gate.if, "github.event_name == 'push'");
  });

  it('has read-only permissions', () => {
    assert.deepEqual(gate.permissions, {
      actions: 'read',
      contents: 'read',
    });
  });

  it('sleeps a named settle window, then compares main to github.sha', () => {
    assert.ok(gateStep, 'a step with id `check` must exist');
    const settle = Number(gateStep.env.DEPLOY_SETTLE_SECONDS);
    assert.ok(
      settle >= 30 && settle <= 300,
      `DEPLOY_SETTLE_SECONDS should be a short settle window, got ${settle}`,
    );
    assert.match(gateStep.run, /sleep "\$DEPLOY_SETTLE_SECONDS"/);
    assert.match(gateStep.run, /git\/ref\/heads\/main/);
    assert.match(gateStep.run, /GITHUB_SHA/);
    assert.equal(
      gate.outputs.superseded,
      '${{ steps.check.outputs.superseded }}',
    );
  });

  it('detect-changes is skipped only on an explicit `superseded == true` (fail open)', () => {
    const detect = deploy.jobs['detect-changes'];
    assert.deepEqual(needsOf('detect-changes'), ['supersede-gate']);
    // Without `!cancelled()` the implicit success() would skip the deploy
    // whenever the gate failed or was skipped (every workflow_dispatch).
    assert.match(detect.if, /!cancelled\(\)/);
    assert.match(
      detect.if,
      /needs\.supersede-gate\.outputs\.superseded != 'true'/,
    );
  });

  it('every child depends on detect-changes, so a superseded run deploys nothing', () => {
    for (const child of CHILDREN) {
      assert.ok(
        needsOf(child).includes('detect-changes'),
        `${child} must need detect-changes`,
      );
      assert.match(
        String(deploy.jobs[child].if),
        /needs\.detect-changes\.outputs\./,
        `${child} must be gated on a detect-changes output`,
      );
    }
  });

  it('Rollup Status is skipped for a superseded run (no markers, Discord, or badge)', () => {
    const rollup = deploy.jobs['rollup-status'];
    assert.ok(needsOf('rollup-status').includes('supersede-gate'));
    assert.match(rollup.if, /always\(\)/);
    assert.match(
      rollup.if,
      /needs\.supersede-gate\.outputs\.superseded != 'true'/,
    );
  });

  it('the watchdog still starts with the run, independent of the gate', () => {
    assert.equal(deploy.jobs.watchdog.needs, undefined);
  });
});

describe('skipping is safe: change detection is marker-based, not pushed-range', () => {
  it('detect-changes decides targets from the last-deployed markers', () => {
    const steps = deploy.jobs['detect-changes'].steps;
    const runs = steps.map((s) => s.run ?? '').join('\n');
    assert.match(runs, /deploy-markers\.mjs detect/);
    assert.doesNotMatch(runs, /event\.before/);
  });

  it('upload-lambdas bases nx affected on the lambdas marker', () => {
    const uploadYml = readWorkflow('upload-lambdas.yml');
    assert.match(uploadYml, /deploy-markers\.mjs"? lambda-base/);
    assert.doesNotMatch(uploadYml, /event\.before/);
  });

  it('no deploy child diffs the pushed range', () => {
    for (const file of [
      'deploy-web.yml',
      'lambda-terraform-apply.yml',
      'deploy-storybook.yml',
    ]) {
      assert.doesNotMatch(
        readWorkflow(file),
        /event\.before/,
        `${file} must not decide what to deploy from github.event.before`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Behaviour: run the step's bash against a stub `gh`.
// ---------------------------------------------------------------------------

const hasTool = (cmd) =>
  spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const canRun = hasTool('bash') && hasTool('jq');

const RUN_ID = '5000';
const RUN_NUMBER = '42';
const OWN_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);

// Responds to `gh api <path> --jq <expr>` from env-provided fixtures; a fixture
// set to FAIL makes that call exit non-zero.
const STUB_GH = `#!/usr/bin/env bash
path="$2"; expr="$4"
case "$path" in
  */git/ref/heads/main) body="$FAKE_REF" ;;
  */actions/runs/*) body="$FAKE_RUN" ;;
  */actions/workflows/*) body="$FAKE_RUNS" ;;
  *) echo "unexpected gh api $path" >&2; exit 2 ;;
esac
[ "$body" = FAIL ] && exit 1
printf '%s' "$body" | jq -r "$expr"
`;

describe(
  'Supersede Gate behaviour',
  { skip: !canRun && 'needs bash + jq' },
  () => {
    let dir;
    before(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supersede-gate-'));
      fs.writeFileSync(path.join(dir, 'gh'), STUB_GH, { mode: 0o755 });
      fs.writeFileSync(path.join(dir, 'gate.sh'), gateStep.run);
    });
    after(() => fs.rmSync(dir, { recursive: true, force: true }));

    function runGate({ mainSha, runs, ref, run }) {
      const out = path.join(dir, 'output');
      const summary = path.join(dir, 'summary');
      fs.writeFileSync(out, '');
      fs.writeFileSync(summary, '');
      const toPosix = (p) => p.replace(/\\/g, '/');
      const result = spawnSync('bash', [toPosix(path.join(dir, 'gate.sh'))], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${path.delimiter}${process.env.PATH}`,
          GITHUB_REPOSITORY: 'org/repo',
          GITHUB_SHA: OWN_SHA,
          GITHUB_RUN_ID: RUN_ID,
          GITHUB_RUN_NUMBER: RUN_NUMBER,
          GITHUB_OUTPUT: toPosix(out),
          GITHUB_STEP_SUMMARY: toPosix(summary),
          DEPLOY_SETTLE_SECONDS: '0',
          NEWER_RUN_WAIT_ATTEMPTS: '2',
          NEWER_RUN_WAIT_SECONDS: '0',
          FAKE_REF: ref ?? JSON.stringify({ object: { sha: mainSha } }),
          FAKE_RUN: run ?? JSON.stringify({ workflow_id: 77 }),
          FAKE_RUNS: JSON.stringify({ workflow_runs: runs ?? [] }),
        },
      });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const output = fs.readFileSync(out, 'utf8');
      return {
        superseded: /superseded=(\w+)/.exec(output)?.[1],
        log: result.stdout,
      };
    }

    const newerPending = {
      run_number: 43,
      status: 'pending',
      html_url: 'https://example/runs/43',
    };

    it('deploys when main is still at github.sha', () => {
      const { superseded } = runGate({
        mainSha: OWN_SHA,
        runs: [newerPending],
      });
      assert.equal(superseded, 'false');
    });

    it('is superseded when main moved and a newer Deploy run is pending', () => {
      const { superseded, log } = runGate({
        mainSha: NEWER_SHA,
        runs: [newerPending, { run_number: 42, status: 'in_progress' }],
      });
      assert.equal(superseded, 'true');
      assert.match(log, /Deploy superseded/);
    });

    it('fails open when main moved but no newer Deploy run exists', () => {
      const { superseded } = runGate({
        mainSha: NEWER_SHA,
        runs: [
          { run_number: 42, status: 'in_progress' },
          { run_number: 41, status: 'completed' },
          // A newer run that already finished cannot ship this commit's work.
          { run_number: 44, status: 'completed' },
        ],
      });
      assert.equal(superseded, 'false');
    });

    it("fails open when main's tip cannot be read", () => {
      const { superseded } = runGate({ ref: 'FAIL', runs: [newerPending] });
      assert.equal(superseded, 'false');
    });

    it('fails open when this run cannot be looked up', () => {
      const { superseded } = runGate({
        mainSha: NEWER_SHA,
        run: 'FAIL',
        runs: [newerPending],
      });
      assert.equal(superseded, 'false');
    });
  },
);
