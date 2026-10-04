/**
 * Unit tests for ci-health-report-gate.mjs (LS-10558).
 *
 * The regression under test: the old inline gate made one
 * /actions/runs/{id}/jobs call per run in the debounce window on every
 * orchestrator completion, exhausting the repo's GITHUB_TOKEN budget. The
 * gate must now make a constant number of API calls (one), keep the debounce
 * semantics, and skip (never go red, never fail open) on API errors.
 *
 * Run via: node --test .github/scripts/__tests__/ci-health-report-gate.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  DECISION,
  MARKER_ARTIFACT_NAME,
  createGhApi,
  decideHealthReportGate,
  isoCutoff,
  renderGateDecision,
} from '../ci-health-report-gate.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(__dirname, '../../workflows/ci-health-report.yml');

const REPO = 'acme/legacy-sports';
const CUTOFF = '2026-09-27T12:00:00Z';
const OPTS = Object.freeze({
  eventName: 'workflow_run',
  repo: REPO,
  cutoff: CUTOFF,
});

function apiReturning(marker) {
  const calls = [];
  return {
    calls,
    latestMarker(args) {
      calls.push(args);
      return marker;
    },
  };
}

describe('decideHealthReportGate', () => {
  it('always runs on manual dispatch without calling the API', () => {
    const api = apiReturning({ created_at: '2026-10-04T00:00:00Z', run_id: 1 });
    const result = decideHealthReportGate(
      { ...OPTS, eventName: 'workflow_dispatch' },
      api,
    );
    assert.equal(result.decision, DECISION.RUN);
    assert.equal(api.calls.length, 0);
  });

  it('debounces when the newest marker is inside the window', () => {
    const api = apiReturning({
      created_at: '2026-10-01T08:00:00Z',
      run_id: 42,
    });
    const result = decideHealthReportGate(OPTS, api);
    assert.equal(result.decision, DECISION.SKIP_DEBOUNCED);
    assert.equal(result.foundRunId, 42);
    assert.deepEqual(api.calls, [
      { repo: REPO, artifactName: MARKER_ARTIFACT_NAME },
    ]);
  });

  it('runs when the newest marker is older than the cutoff', () => {
    const api = apiReturning({
      created_at: '2026-09-20T08:00:00Z',
      run_id: 41,
    });
    assert.equal(decideHealthReportGate(OPTS, api).decision, DECISION.RUN);
  });

  it('runs when no marker exists yet', () => {
    assert.equal(
      decideHealthReportGate(OPTS, apiReturning(null)).decision,
      DECISION.RUN,
    );
  });

  it('skips (inconclusive) on a gh api error instead of failing or running', () => {
    const api = {
      latestMarker() {
        const err = new Error('Command failed: gh api');
        err.stderr = 'gh: API rate limit exceeded for installation (HTTP 403)';
        throw err;
      },
    };
    const result = decideHealthReportGate(OPTS, api);
    assert.equal(result.decision, DECISION.SKIP_INCONCLUSIVE);
    assert.match(result.error, /rate limit exceeded/);
  });
});

describe('createGhApi.latestMarker', () => {
  it('makes exactly one non-paginated, name-filtered request', () => {
    const invocations = [];
    const api = createGhApi((args) => {
      invocations.push(args);
      return '{"created_at":"2026-10-01T08:00:00Z","run_id":42}\n';
    });
    const marker = api.latestMarker({
      repo: REPO,
      artifactName: MARKER_ARTIFACT_NAME,
    });
    assert.deepEqual(marker, {
      created_at: '2026-10-01T08:00:00Z',
      run_id: 42,
    });
    assert.equal(invocations.length, 1);
    assert.ok(!invocations[0].includes('--paginate'));
    assert.match(
      invocations[0][1],
      /actions\/artifacts\?name=ci-health-report-marker&per_page=100$/,
    );
  });

  it('returns null on an empty response', () => {
    const api = createGhApi(() => '\n');
    assert.equal(
      api.latestMarker({ repo: REPO, artifactName: MARKER_ARTIFACT_NAME }),
      null,
    );
  });

  it('throws (→ inconclusive) on an unparseable timestamp', () => {
    const api = createGhApi(() => '{"created_at":null,"run_id":1}');
    const result = decideHealthReportGate(OPTS, {
      latestMarker: (args) => api.latestMarker(args),
    });
    assert.equal(result.decision, DECISION.SKIP_INCONCLUSIVE);
  });
});

describe('isoCutoff / renderGateDecision', () => {
  it('formats the cutoff without milliseconds', () => {
    assert.equal(
      isoCutoff(new Date('2026-10-04T12:00:00.123Z'), 168),
      '2026-09-27T12:00:00Z',
    );
  });

  it('emits should-run=false for skips and a warning for inconclusive', () => {
    const { outputLines, logLines } = renderGateDecision(
      {
        decision: DECISION.SKIP_INCONCLUSIVE,
        reason: 'x',
        error: 'boom',
        apiCalls: 1,
      },
      { cutoff: CUTOFF, minIntervalHours: 168 },
    );
    assert.deepEqual(outputLines, ['should-run=false']);
    assert.ok(logLines.some((l) => l.startsWith('::warning')));
  });
});

describe('ci-health-report.yml wiring', () => {
  const wf = yaml.load(fs.readFileSync(WORKFLOW, 'utf8'));

  it('gate runs the script and makes no per-run jobs calls', () => {
    const steps = wf.jobs.gate.steps;
    assert.ok(
      steps.some(
        (s) => s.run === 'node .github/scripts/ci-health-report-gate.mjs',
      ),
    );
    assert.ok(!JSON.stringify(steps).includes('/jobs'));
  });

  it('Analyze uploads the marker first, on automated runs only', () => {
    const steps = wf.jobs.analyze.steps;
    const uploadIdx = steps.findIndex((s) =>
      String(s.uses).startsWith('actions/upload-artifact@'),
    );
    const analyzeIdx = steps.findIndex((s) => s.id === 'analyze');
    assert.ok(uploadIdx >= 0 && uploadIdx < analyzeIdx);
    assert.equal(steps[uploadIdx].with.name, MARKER_ARTIFACT_NAME);
    assert.equal(steps[uploadIdx].if, "github.event_name == 'workflow_run'");
    assert.equal(wf.jobs.analyze.name, 'Analyze');
  });
});
