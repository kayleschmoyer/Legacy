/**
 * Tests for deploy-superseded.mjs and its consumers (LS-10964).
 *
 * A superseded Deploy run (deploy.yml's Supersede Gate skipped it because the
 * merge queue landed more of a batch) deploys nothing but still concludes
 * `success` and fires every `workflow_run: [Deploy]` consumer. Each consumer
 * must recognise it and stand down, and it must fail open: if it cannot tell,
 * it behaves as it did before LS-10964.
 *
 * Run via: node --test .github/scripts/__tests__/deploy-superseded.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  DETECT_JOB,
  SUPERSEDE_GATE_JOB,
  checkRunSuperseded,
  isSupersededDeployJobs,
  triggerRunId,
} from '../deploy-superseded.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.join(__dirname, '../../workflows');
const SCRIPT = path.join(__dirname, '../deploy-superseded.mjs');

function load(file) {
  return yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
}

const SUPERSEDED_JOBS = [
  { name: 'Supersede Gate', conclusion: 'success' },
  { name: 'Deploy Watchdog', conclusion: 'success' },
  { name: 'Detect Deploy Targets', conclusion: 'skipped' },
  { name: 'Upload Lambdas', conclusion: 'skipped' },
  { name: 'Rollup Status', conclusion: 'skipped' },
];

describe('isSupersededDeployJobs', () => {
  it('matches a run whose gate succeeded and whose detect job was skipped', () => {
    assert.equal(isSupersededDeployJobs(SUPERSEDED_JOBS), true);
  });

  it('a run the gate let through is a real deploy', () => {
    assert.equal(
      isSupersededDeployJobs([
        { name: 'Supersede Gate', conclusion: 'success' },
        { name: 'Detect Deploy Targets', conclusion: 'success' },
      ]),
      false,
    );
  });

  it('a workflow_dispatch Deploy (gate skipped) is a real deploy', () => {
    assert.equal(
      isSupersededDeployJobs([
        { name: 'Supersede Gate', conclusion: 'skipped' },
        { name: 'Detect Deploy Targets', conclusion: 'success' },
      ]),
      false,
    );
  });

  it('a gate that failed or was cancelled is not read as superseded', () => {
    for (const conclusion of ['failure', 'cancelled', null]) {
      assert.equal(
        isSupersededDeployJobs([
          { name: 'Supersede Gate', conclusion },
          { name: 'Detect Deploy Targets', conclusion: 'skipped' },
        ]),
        false,
        `gate ${conclusion}`,
      );
    }
  });

  it('runs of other workflows and malformed input are not superseded', () => {
    assert.equal(
      isSupersededDeployJobs([{ name: 'Apply', conclusion: 'success' }]),
      false,
    );
    assert.equal(isSupersededDeployJobs([]), false);
    assert.equal(isSupersededDeployJobs(null), false);
    assert.equal(isSupersededDeployJobs({ jobs: [] }), false);
  });
});

describe('checkRunSuperseded', () => {
  it('reads the latest attempt of the triggering run and decides from its jobs', () => {
    const calls = [];
    const result = checkRunSuperseded({
      repo: 'acme/legacy-sports',
      runId: 123,
      exec(args) {
        calls.push(args);
        return JSON.stringify(SUPERSEDED_JOBS);
      },
    });
    assert.equal(result.superseded, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'api');
    assert.equal(
      calls[0][1],
      'repos/acme/legacy-sports/actions/runs/123/jobs?filter=latest&per_page=100',
    );
  });

  it('fails open on a gh error', () => {
    const result = checkRunSuperseded({
      repo: 'acme/legacy-sports',
      runId: 123,
      exec() {
        throw Object.assign(new Error('exit 1'), {
          stderr: 'gh: API rate limit exceeded (HTTP 403)',
        });
      },
    });
    assert.equal(result.superseded, false);
    assert.match(result.reason, /rate limit/);
  });

  it('fails open on unparseable output', () => {
    const result = checkRunSuperseded({
      repo: 'r/r',
      runId: 1,
      exec: () => 'not json',
    });
    assert.equal(result.superseded, false);
  });

  it('fails open with no run id, without calling gh', () => {
    const result = checkRunSuperseded({
      repo: 'r/r',
      runId: undefined,
      exec: () => assert.fail('gh must not be called'),
    });
    assert.equal(result.superseded, false);
  });
});

describe('triggerRunId', () => {
  it('prefers TRIGGER_RUN_ID', () => {
    assert.equal(triggerRunId({ TRIGGER_RUN_ID: '77' }), '77');
  });

  it('reads workflow_run.id from the event payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-superseded-'));
    try {
      const eventPath = path.join(dir, 'event.json');
      fs.writeFileSync(eventPath, JSON.stringify({ workflow_run: { id: 99 } }));
      assert.equal(
        triggerRunId({
          GITHUB_EVENT_NAME: 'workflow_run',
          GITHUB_EVENT_PATH: eventPath,
        }),
        99,
      );
      assert.equal(
        triggerRunId({
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_EVENT_PATH: eventPath,
        }),
        undefined,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is undefined when the payload is unreadable', () => {
    assert.equal(
      triggerRunId({
        GITHUB_EVENT_NAME: 'workflow_run',
        GITHUB_EVENT_PATH: path.join(os.tmpdir(), 'does-not-exist.json'),
      }),
      undefined,
    );
  });
});

describe('CLI', () => {
  it('writes superseded=false for a non-workflow_run event and exits 0', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-superseded-'));
    try {
      const out = path.join(dir, 'output');
      fs.writeFileSync(out, '');
      const env = {
        ...process.env,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_OUTPUT: out,
      };
      delete env.TRIGGER_RUN_ID;
      const result = spawnSync(process.execPath, [SCRIPT], {
        encoding: 'utf8',
        env,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(out, 'utf8'), 'superseded=false\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the job names match deploy.yml', () => {
  const deploy = load('deploy.yml');

  it('Supersede Gate and Detect Deploy Targets keep their display names', () => {
    assert.equal(deploy.jobs['supersede-gate'].name, SUPERSEDE_GATE_JOB);
    assert.equal(deploy.jobs['detect-changes'].name, DETECT_JOB);
  });

  it('Detect Deploy Targets is skipped exactly when the gate says superseded', () => {
    assert.match(
      deploy.jobs['detect-changes'].if,
      /needs\.supersede-gate\.outputs\.superseded != 'true'/,
    );
  });
});

describe('every workflow_run consumer of Deploy stands down for a superseded run', () => {
  // Lanes that decide through full-suite-gate.mjs (covered in
  // full-suite-gate.test.mjs) and lanes with their own superseded-check job.
  const FULL_SUITE_LANES = [
    'run-playwright-tests.yml',
    'cross-browser-e2e.yml',
    'run-maestro-sweep.yml',
    'e2e-native-android.yml',
  ];
  const CHECK_JOB_LANES = {
    'lambda-drift-check.yml': [
      'version-drift',
      'marker-drift',
      'skip-chain-check',
    ],
    'terraform-lock-watchdog.yml': ['watchdog'],
  };

  it('no Deploy consumer is missing from this list', () => {
    const consumers = fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((f) => /\.ya?ml$/.test(f))
      .filter((f) => {
        const on = load(f)?.on;
        const workflows = on?.workflow_run?.workflows ?? [];
        return [].concat(workflows).includes('Deploy');
      })
      .sort();
    assert.deepEqual(
      consumers,
      [...FULL_SUITE_LANES, ...Object.keys(CHECK_JOB_LANES)].sort(),
      'a new workflow_run: [Deploy] consumer must handle superseded Deploy runs (LS-10964)',
    );
  });

  for (const file of FULL_SUITE_LANES) {
    it(`${file} ships deploy-superseded.mjs in the gate's sparse checkout`, () => {
      const checkout = load(file).jobs.gate.steps.find((s) =>
        String(s.uses ?? '').startsWith('actions/checkout@'),
      );
      assert.match(
        String(checkout.with['sparse-checkout']),
        /\.github\/scripts\/deploy-superseded\.mjs/,
        'full-suite-gate.mjs imports it; without it the gate crashes',
      );
    });
  }

  for (const [file, jobIds] of Object.entries(CHECK_JOB_LANES)) {
    it(`${file} gates its work on a fail-open superseded-check job`, () => {
      const wf = load(file);
      const check = wf.jobs['superseded-check'];
      assert.ok(check, 'a superseded-check job must exist');
      assert.equal(check['runs-on'], 'ubuntu-latest');
      assert.equal(check.needs, undefined);
      assert.equal(
        check.outputs.superseded,
        '${{ steps.check.outputs.superseded }}',
      );
      const step = check.steps.find((s) => s.id === 'check');
      assert.match(step.run, /node \.github\/scripts\/deploy-superseded\.mjs/);
      assert.ok(step.env.GH_TOKEN);
      const checkout = check.steps.find((s) =>
        String(s.uses ?? '').startsWith('actions/checkout@'),
      );
      assert.match(
        String(checkout.with['sparse-checkout']),
        /deploy-superseded\.mjs/,
      );

      for (const id of jobIds) {
        const job = wf.jobs[id];
        assert.deepEqual([].concat(job.needs), ['superseded-check'], id);
        // !cancelled(): a failed check must not skip the job (fail open).
        assert.match(job.if, /!cancelled\(\)/, id);
        assert.match(
          job.if,
          /needs\.superseded-check\.outputs\.superseded != 'true'/,
          id,
        );
      }
    });
  }
});
