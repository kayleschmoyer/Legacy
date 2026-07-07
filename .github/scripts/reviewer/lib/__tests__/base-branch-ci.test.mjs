import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchBaseBranchFailingChecks,
  formatBaseBranchCiSection,
} from '../base-branch-ci.mjs';

function makeExec({ checkRuns = null, statuses = null } = {}) {
  return (cmd, args) => {
    assert.equal(cmd, 'gh');
    const endpoint = args[1];
    if (endpoint.includes('/check-runs')) {
      if (checkRuns === null) throw new Error('check-runs unavailable');
      return JSON.stringify({ check_runs: checkRuns });
    }
    if (endpoint.includes('/status')) {
      if (statuses === null) throw new Error('status unavailable');
      return JSON.stringify({ statuses });
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
}

describe('fetchBaseBranchFailingChecks', () => {
  it('returns [] for a falsy or non-string base ref', () => {
    assert.deepEqual(
      fetchBaseBranchFailingChecks('', () => ''),
      [],
    );
    assert.deepEqual(
      fetchBaseBranchFailingChecks(null, () => ''),
      [],
    );
    assert.deepEqual(
      fetchBaseBranchFailingChecks(undefined, () => ''),
      [],
    );
  });

  it('collects failing check-run names (completed + failing conclusion)', () => {
    const exec = makeExec({
      checkRuns: [
        { name: 'e2e', status: 'completed', conclusion: 'failure' },
        { name: 'typecheck', status: 'completed', conclusion: 'success' },
        { name: 'build', status: 'completed', conclusion: 'timed_out' },
        { name: 'lint', status: 'in_progress', conclusion: null },
        { name: 'flaky', status: 'completed', conclusion: 'neutral' },
      ],
    });
    const result = fetchBaseBranchFailingChecks('main', exec);
    assert.deepEqual(result, ['build', 'e2e']);
  });

  it('collects failing commit-status contexts and merges with check-runs', () => {
    const exec = makeExec({
      checkRuns: [{ name: 'e2e', status: 'completed', conclusion: 'failure' }],
      statuses: [
        { context: 'integration-tests', state: 'error' },
        { context: 'bot-review', state: 'success' },
        { context: 'coverage', state: 'failure' },
        { context: 'pending-thing', state: 'pending' },
      ],
    });
    const result = fetchBaseBranchFailingChecks('main', exec);
    // sorted + deduped union of failing check-runs and statuses
    assert.deepEqual(result, ['coverage', 'e2e', 'integration-tests']);
  });

  it('is non-fatal when check-runs fails but statuses succeed', () => {
    const exec = makeExec({
      checkRuns: null, // throws
      statuses: [{ context: 'coverage', state: 'failure' }],
    });
    assert.deepEqual(fetchBaseBranchFailingChecks('main', exec), ['coverage']);
  });

  it('returns [] when both sources throw', () => {
    const exec = () => {
      throw new Error('gh boom');
    };
    assert.deepEqual(fetchBaseBranchFailingChecks('main', exec), []);
  });

  it('deduplicates a name appearing in both check-runs and statuses', () => {
    const exec = makeExec({
      checkRuns: [{ name: 'e2e', status: 'completed', conclusion: 'failure' }],
      statuses: [{ context: 'e2e', state: 'failure' }],
    });
    assert.deepEqual(fetchBaseBranchFailingChecks('main', exec), ['e2e']);
  });

  it('passes the base ref (including slashes) into the endpoint path', () => {
    const seen = [];
    const exec = (_cmd, args) => {
      seen.push(args[1]);
      return JSON.stringify({ check_runs: [], statuses: [] });
    };
    fetchBaseBranchFailingChecks('release/v2', exec);
    assert.ok(
      seen.some((e) => e.includes('/commits/release/v2/check-runs')),
      'check-runs endpoint should embed the full base ref',
    );
    assert.ok(
      seen.some((e) => e.includes('/commits/release/v2/status')),
      'status endpoint should embed the full base ref',
    );
  });
});

describe('formatBaseBranchCiSection', () => {
  it('returns empty string when there are no failing checks', () => {
    assert.equal(formatBaseBranchCiSection([], 'main'), '');
    assert.equal(formatBaseBranchCiSection(null, 'main'), '');
  });

  it('wraps the section in safety markers and lists each check', () => {
    const section = formatBaseBranchCiSection(['e2e', 'coverage'], 'main');
    assert.match(section, /BEGIN BASE-BRANCH CI STATE/);
    assert.match(section, /END BASE-BRANCH CI STATE/);
    assert.match(section, /`e2e`/);
    assert.match(section, /`coverage`/);
  });

  it('instructs the model to treat matching failures as pre-existing/non-blocking', () => {
    const section = formatBaseBranchCiSection(['e2e'], 'main');
    assert.match(section, /pre-existing/i);
    assert.match(section, /observation/);
    assert.match(section, /`main`/);
  });
});
