/**
 * Unit tests for full-suite-gate.mjs (LS-10336).
 *
 * The regression under test: the inline gates probed each prior run's jobs
 * with `gh api ... 2>/dev/null || echo 0`, so a rate-limit 403 read every
 * prior run as "no real attempt" and the gate failed OPEN (should-run=true),
 * contradicting the fail-closed list call from LS-9329. Every gh error must
 * now resolve to `skip-inconclusive` → should-run=false.
 *
 * Run via: node --test .github/scripts/__tests__/full-suite-gate.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  DECISION,
  createGhApi,
  decideFullSuiteGate,
  isoCutoff,
  renderGateDecision,
} from '../full-suite-gate.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.join(__dirname, '../../workflows');

const REPO = 'acme/legacy-sports';
const SELF = 900;
const BASE_OPTS = Object.freeze({
  eventName: 'workflow_run',
  repo: REPO,
  workflowFile: 'run-playwright-tests.yml',
  sentinelJob: 'Prepare Matrix',
  selfRunId: SELF,
  cutoff: '2026-09-29T14:00:00Z',
});

/** A gh error the way execFileSync surfaces a non-zero exit. */
function ghFailure(status, message) {
  return Object.assign(new Error(`Command failed: gh api (exit ${status})`), {
    status,
    stderr: `gh: ${message}`,
    stdout: '',
  });
}
const RATE_LIMIT_403 = () =>
  ghFailure(1, 'API rate limit exceeded for installation ID 1234. (HTTP 403)');

/** In-memory api: `runs` is the list result, `jobs` maps runId → count | Error. */
function fakeApi({ runs = [], jobs = {}, listError = null }) {
  const probed = [];
  return {
    probed,
    listRuns() {
      if (listError) throw listError;
      return runs;
    },
    countSentinelJobs({ runId }) {
      probed.push(runId);
      const v = jobs[runId];
      if (v instanceof Error) throw v;
      return v ?? 0;
    },
  };
}

describe('decideFullSuiteGate', () => {
  it('always runs on a manual dispatch without touching the API', () => {
    const api = fakeApi({ listError: RATE_LIMIT_403() });
    const r = decideFullSuiteGate(
      { ...BASE_OPTS, eventName: 'workflow_dispatch' },
      api,
    );
    assert.equal(r.decision, DECISION.RUN);
    assert.deepEqual(api.probed, []);
  });

  it('runs when no prior run made a real attempt', () => {
    const api = fakeApi({
      runs: [{ id: 3 }, { id: 2 }, { id: 1 }],
      jobs: { 3: 0, 2: 0, 1: 0 },
    });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.RUN);
    assert.equal(r.inspected, 3);
    assert.deepEqual(api.probed, [3, 2, 1]);
  });

  it('runs when the only prior run is this run itself', () => {
    const api = fakeApi({ runs: [{ id: SELF }], jobs: { [SELF]: 1 } });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.RUN);
    assert.deepEqual(api.probed, []);
  });

  it('skips (debounced) on the first prior run with a real attempt and stops walking', () => {
    const api = fakeApi({
      runs: [{ id: 3 }, { id: 2 }, { id: 1 }],
      jobs: { 3: 0, 2: 1, 1: 1 },
    });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.SKIP_DEBOUNCED);
    assert.equal(r.foundRunId, 2);
    assert.deepEqual(api.probed, [3, 2]);
  });

  it('skips (inconclusive) when the prior-run LIST call fails (LS-9329)', () => {
    const api = fakeApi({ listError: RATE_LIMIT_403() });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.SKIP_INCONCLUSIVE);
    assert.match(r.reason, /listing prior runs/);
    assert.match(r.error, /HTTP 403/);
  });

  it('LS-10336: skips (inconclusive) when a per-run JOBS probe 403s — never fails open', () => {
    // Before the fix every run read as "0 prepared" and the gate ran the
    // whole suite. The first errored probe must short-circuit to skip.
    const api = fakeApi({
      runs: [{ id: 3 }, { id: 2 }, { id: 1 }],
      jobs: { 3: RATE_LIMIT_403(), 2: 1 },
    });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.SKIP_INCONCLUSIVE);
    assert.notEqual(r.decision, DECISION.RUN);
    assert.match(r.reason, /run 3/);
    assert.match(r.error, /HTTP 403/);
    assert.deepEqual(api.probed, [3]);
  });

  it('skips (inconclusive) on a 403 that arrives after some clean probes', () => {
    const api = fakeApi({
      runs: [{ id: 3 }, { id: 2 }, { id: 1 }],
      jobs: { 3: 0, 2: RATE_LIMIT_403(), 1: 0 },
    });
    const r = decideFullSuiteGate(BASE_OPTS, api);
    assert.equal(r.decision, DECISION.SKIP_INCONCLUSIVE);
    assert.equal(r.inspected, 1);
  });

  it('pre-filters short-lived runs by wall time when minRealAttemptSeconds is set', () => {
    const runs = [
      // 40s — a debounced no-op; must not be probed.
      {
        id: 3,
        run_started_at: '2026-09-30T10:00:00Z',
        updated_at: '2026-09-30T10:00:40Z',
      },
      // Missing timestamps — probed (unknown ≠ short).
      { id: 2 },
      // 40 min — a real attempt.
      {
        id: 1,
        run_started_at: '2026-09-30T08:00:00Z',
        updated_at: '2026-09-30T08:40:00Z',
      },
    ];
    const api = fakeApi({ runs, jobs: { 3: 1, 2: 0, 1: 1 } });
    const r = decideFullSuiteGate(
      { ...BASE_OPTS, minRealAttemptSeconds: 300 },
      api,
    );
    assert.equal(r.decision, DECISION.SKIP_DEBOUNCED);
    assert.equal(r.foundRunId, 1);
    assert.deepEqual(api.probed, [2, 1]);
  });
});

describe('createGhApi', () => {
  it('lists runs across pages with --paginate and parses one JSON object per line', () => {
    const calls = [];
    const api = createGhApi((args) => {
      calls.push(args);
      return [
        '{"id":3,"run_started_at":"2026-09-30T10:00:00Z","updated_at":"2026-09-30T10:00:40Z"}',
        '{"id":2,"run_started_at":null,"updated_at":null}',
        '',
      ].join('\n');
    });
    const runs = api.listRuns({
      repo: REPO,
      workflowFile: 'run-playwright-tests.yml',
      cutoff: '2026-09-29T14:00:00Z',
    });
    assert.deepEqual(
      runs.map((r) => r.id),
      [3, 2],
    );
    assert.equal(calls[0][0], 'api');
    assert.ok(calls[0].includes('--paginate'));
    assert.match(
      calls[0][2],
      /^repos\/acme\/legacy-sports\/actions\/workflows\/run-playwright-tests\.yml\/runs\?event=workflow_run&created=%3E2026-09-29T14:00:00Z&per_page=100$/,
    );
  });

  it('counts non-skipped completed sentinel jobs for a run', () => {
    const calls = [];
    const api = createGhApi((args) => {
      calls.push(args);
      return '2\n';
    });
    const n = api.countSentinelJobs({
      repo: REPO,
      runId: 42,
      sentinelJob: 'Prepare Matrix',
    });
    assert.equal(n, 2);
    assert.equal(
      calls[0][1],
      `repos/${REPO}/actions/runs/42/jobs?per_page=100`,
    );
    assert.match(calls[0][3], /\.name == "Prepare Matrix"/);
    assert.match(calls[0][3], /\.conclusion != "skipped"/);
  });

  it('propagates a gh non-zero exit (403) as a throw, not as 0', () => {
    const api = createGhApi(() => {
      throw RATE_LIMIT_403();
    });
    assert.throws(
      () =>
        api.countSentinelJobs({
          repo: REPO,
          runId: 42,
          sentinelJob: 'Prepare Matrix',
        }),
      (err) => err.status === 1 && /HTTP 403/.test(err.stderr),
    );
  });

  it('throws on a non-numeric jobs response instead of treating it as 0', () => {
    const api = createGhApi(() => '');
    assert.throws(
      () =>
        api.countSentinelJobs({
          repo: REPO,
          runId: 42,
          sentinelJob: 'Prepare Matrix',
        }),
      /unexpected jobs response/,
    );
  });
});

describe('renderGateDecision', () => {
  const ctx = {
    title: 'Full-Suite Gate',
    cutoff: '2026-09-29T14:00:00Z',
    minIntervalHours: '20',
    serverUrl: 'https://github.com',
    repo: REPO,
  };

  it('inconclusive → should-run=false, skip-reason, summary and LOG line all say so', () => {
    const r = renderGateDecision(
      {
        decision: DECISION.SKIP_INCONCLUSIVE,
        reason: 'gh api failed while inspecting the jobs of prior run 3',
        error: 'gh: API rate limit exceeded (HTTP 403)',
        inspected: 0,
      },
      ctx,
    );
    assert.equal(r.outputLines[0], 'should-run=false');
    assert.match(r.outputLines[1], /^skip-reason=Inconclusive — /);
    assert.equal(
      r.summaryLines[0],
      '## Full-Suite Gate — SKIPPED (inconclusive)',
    );
    assert.ok(
      r.summaryLines.some((l) => l.includes('**inconclusive → skip**')),
    );
    assert.ok(
      r.summaryLines.includes('gh: API rate limit exceeded (HTTP 403)'),
    );
    // Step summaries are not API-readable: the decision must reach the job log.
    assert.match(
      r.logLines[0],
      /decision=skip-inconclusive should-run=false .*inspected=0/,
    );
    assert.ok(r.logLines.some((l) => l.includes('HTTP 403')));
  });

  it('debounced → should-run=false with a linked run id', () => {
    const r = renderGateDecision(
      {
        decision: DECISION.SKIP_DEBOUNCED,
        reason: 'Debounced — run 2 already made a real attempt.',
        foundRunId: 2,
        inspected: 2,
      },
      { ...ctx, note: '**No emulator test ran in this run.**' },
    );
    assert.equal(r.outputLines[0], 'should-run=false');
    assert.equal(
      r.outputLines[1],
      'skip-reason=Debounced — run 2 already made a real attempt.',
    );
    assert.equal(r.summaryLines[0], '## Full-Suite Gate — SKIPPED (debounced)');
    assert.ok(r.summaryLines.includes('**No emulator test ran in this run.**'));
    assert.ok(
      r.summaryLines.some((l) =>
        l.includes(`https://github.com/${REPO}/actions/runs/2`),
      ),
    );
    assert.match(r.logLines[0], /decision=skip-debounced should-run=false/);
  });

  it('run → should-run=true, no skip-reason, RUNNING heading, note omitted', () => {
    const r = renderGateDecision(
      {
        decision: DECISION.RUN,
        reason: 'No automated run made a real attempt.',
        inspected: 4,
      },
      { ...ctx, note: '**No emulator test ran in this run.**' },
    );
    assert.deepEqual(r.outputLines, ['should-run=true']);
    assert.equal(r.summaryLines[0], '## Full-Suite Gate — RUNNING');
    assert.ok(
      !r.summaryLines.includes('**No emulator test ran in this run.**'),
    );
    assert.match(r.logLines[0], /decision=run should-run=true .*inspected=4/);
  });

  it('flattens a multi-line skip reason into one $GITHUB_OUTPUT line', () => {
    const r = renderGateDecision(
      { decision: DECISION.SKIP_INCONCLUSIVE, reason: 'a\nb', inspected: 0 },
      ctx,
    );
    assert.equal(r.outputLines.length, 2);
    assert.ok(!r.outputLines[1].includes('\n'));
  });
});

describe('isoCutoff', () => {
  it('subtracts the interval and drops milliseconds', () => {
    assert.equal(
      isoCutoff(new Date('2026-09-30T14:30:15.123Z'), 20),
      '2026-09-29T18:30:15Z',
    );
  });
});

/**
 * Workflow wiring: every one of the four gates must run the shared script
 * (so no inline `|| echo 0` can creep back), check out .github/scripts so the
 * script exists on the runner, and name its own sentinel job.
 */
describe('gate jobs use full-suite-gate.mjs', () => {
  const LANES = [
    {
      file: 'run-playwright-tests.yml',
      sentinel: 'Prepare Matrix',
      sentinelJobId: 'prepare',
    },
    {
      file: 'cross-browser-e2e.yml',
      sentinel: 'Prepare Matrix',
      sentinelJobId: 'prepare',
    },
    {
      file: 'run-maestro-sweep.yml',
      sentinel: 'Prepare Sweep',
      sentinelJobId: 'prepare',
    },
    {
      file: 'e2e-native-android.yml',
      sentinel: 'Build Bypass APK',
      sentinelJobId: 'build-bypass-apk',
    },
  ];

  for (const lane of LANES) {
    it(`${lane.file} gate delegates to the script with the right sentinel`, () => {
      const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, lane.file), 'utf8');
      const wf = yaml.load(raw);
      const gate = wf.jobs.gate;
      assert.ok(gate, 'gate job exists');
      assert.ok(
        gate.outputs['should-run'].includes('steps.decide.outputs.should-run'),
      );

      const checkout = gate.steps.find((s) =>
        String(s.uses ?? '').startsWith('actions/checkout@'),
      );
      assert.ok(checkout, 'gate checks out the repo');
      assert.match(
        String(checkout.with['sparse-checkout'] ?? ''),
        /\.github\/scripts\/full-suite-gate\.mjs/,
      );

      const decide = gate.steps.find((s) => s.id === 'decide');
      assert.ok(decide, 'decide step exists');
      assert.match(decide.run, /node \.github\/scripts\/full-suite-gate\.mjs/);
      assert.equal(decide.env.GATE_WORKFLOW_FILE, lane.file);
      assert.equal(decide.env.GATE_SENTINEL_JOB, lane.sentinel);
      assert.ok(decide.env.GH_TOKEN, 'gh is authenticated');
      assert.ok(decide.env.MIN_INTERVAL_HOURS, 'interval is set');
      assert.ok(
        !/\|\|\s*echo 0/.test(decide.run),
        'no fail-open `|| echo 0` probe remains inline',
      );

      // The sentinel really is a job in this workflow, with that display name.
      assert.equal(wf.jobs[lane.sentinelJobId]?.name, lane.sentinel);
    });
  }
});
