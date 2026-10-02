/**
 * Unit tests for the E2E ledger record builder (LS-9757).
 *
 * Run via: node --test .github/scripts/e2e-ledger/__tests__/*.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildLedgerRecords,
  canonicalizeSpec,
  computeRelatedToDiff,
  groupRecordsBySpec,
  isSafeSpecPath,
  parseAffectedSpecs,
  parseManifestSpecs,
  toNdjson,
} from '../build-ledger-records.mjs';

const SPEC_A = 'apps/web-e2e/src/tests/a.spec.ts';
const SPEC_B = 'apps/web-e2e/src/tests/b.spec.ts';

// ---------------------------------------------------------------------------
// isSafeSpecPath
// ---------------------------------------------------------------------------

test('isSafeSpecPath accepts a clean relative spec path', () => {
  assert.equal(isSafeSpecPath(SPEC_A), true);
  assert.equal(isSafeSpecPath('a.spec.ts'), true);
});

test('isSafeSpecPath rejects path traversal', () => {
  assert.equal(isSafeSpecPath('../../etc/passwd'), false);
  assert.equal(isSafeSpecPath('..'), false);
  assert.equal(isSafeSpecPath('apps/../../../etc/passwd'), false);
  assert.equal(isSafeSpecPath('foo/../../bar'), false);
});

test('isSafeSpecPath rejects absolute paths', () => {
  assert.equal(isSafeSpecPath('/etc/passwd'), false);
});

test('isSafeSpecPath rejects non-string / empty input', () => {
  assert.equal(isSafeSpecPath(undefined), false);
  assert.equal(isSafeSpecPath(null), false);
  assert.equal(isSafeSpecPath(''), false);
  assert.equal(isSafeSpecPath(42), false);
});

// ---------------------------------------------------------------------------
// computeRelatedToDiff
// ---------------------------------------------------------------------------

test('computeRelatedToDiff is null for nightly/full-suite runs (no diff to relate to)', () => {
  assert.equal(
    computeRelatedToDiff({
      isPrRun: false,
      runAll: false,
      affectedSpecs: new Set([SPEC_A]),
      spec: SPEC_A,
    }),
    null,
  );
  // Even when runAll is true — nightly has no PR diff at all.
  assert.equal(
    computeRelatedToDiff({
      isPrRun: false,
      runAll: true,
      affectedSpecs: new Set(),
      spec: SPEC_A,
    }),
    null,
  );
});

test('computeRelatedToDiff is true for every spec when e2e-select promoted to run-all', () => {
  assert.equal(
    computeRelatedToDiff({
      isPrRun: true,
      runAll: true,
      affectedSpecs: new Set(),
      spec: SPEC_A,
    }),
    true,
  );
});

test('computeRelatedToDiff reflects e2e-select affected-specs membership on narrow PR runs', () => {
  const affectedSpecs = new Set([SPEC_A]);
  assert.equal(
    computeRelatedToDiff({
      isPrRun: true,
      runAll: false,
      affectedSpecs,
      spec: SPEC_A,
    }),
    true,
  );
  assert.equal(
    computeRelatedToDiff({
      isPrRun: true,
      runAll: false,
      affectedSpecs,
      spec: SPEC_B,
    }),
    false,
  );
});

test('computeRelatedToDiff defaults a missing affectedSpecs set to "not related"', () => {
  assert.equal(
    computeRelatedToDiff({
      isPrRun: true,
      runAll: false,
      affectedSpecs: undefined,
      spec: SPEC_A,
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// buildLedgerRecords
// ---------------------------------------------------------------------------

test('buildLedgerRecords enriches raw reporter entries with run context', () => {
  const records = buildLedgerRecords({
    entries: [
      { spec: SPEC_A, testName: 'renders', status: 'passed', retryCount: 0 },
      {
        spec: SPEC_A,
        testName: 'flakes sometimes',
        status: 'flaky',
        retryCount: 1,
      },
    ],
    sha: 'abc123',
    prNumber: 42,
    timestamp: '2026-08-30T00:00:00.000Z',
    isPrRun: true,
    runAll: false,
    affectedSpecs: new Set([SPEC_A]),
  });

  assert.deepEqual(records, [
    {
      sha: 'abc123',
      prNumber: 42,
      timestamp: '2026-08-30T00:00:00.000Z',
      spec: SPEC_A,
      testName: 'renders',
      status: 'passed',
      retryCount: 0,
      relatedToDiff: true,
    },
    {
      sha: 'abc123',
      prNumber: 42,
      timestamp: '2026-08-30T00:00:00.000Z',
      spec: SPEC_A,
      testName: 'flakes sometimes',
      status: 'flaky',
      retryCount: 1,
      relatedToDiff: true,
    },
  ]);
});

test('buildLedgerRecords sets prNumber null and relatedToDiff null on nightly runs', () => {
  const [record] = buildLedgerRecords({
    entries: [{ spec: SPEC_A, testName: 't', status: 'passed', retryCount: 0 }],
    sha: 'abc123',
    prNumber: null,
    timestamp: '2026-08-30T00:00:00.000Z',
    isPrRun: false,
    runAll: false,
    affectedSpecs: new Set(),
  });
  assert.equal(record.prNumber, null);
  assert.equal(record.relatedToDiff, null);
});

test('buildLedgerRecords defaults a missing retryCount to 0', () => {
  const [record] = buildLedgerRecords({
    entries: [{ spec: SPEC_A, testName: 't', status: 'passed' }],
    sha: 'abc123',
    prNumber: null,
    timestamp: '2026-08-30T00:00:00.000Z',
    isPrRun: false,
    runAll: false,
    affectedSpecs: new Set(),
  });
  assert.equal(record.retryCount, 0);
});

test('buildLedgerRecords is defensive against a non-array entries input', () => {
  assert.deepEqual(
    buildLedgerRecords({
      entries: undefined,
      sha: 'abc123',
      prNumber: null,
      timestamp: '2026-08-30T00:00:00.000Z',
      isPrRun: false,
      runAll: false,
      affectedSpecs: new Set(),
    }),
    [],
  );
});

// ---------------------------------------------------------------------------
// groupRecordsBySpec / toNdjson
// ---------------------------------------------------------------------------

test('groupRecordsBySpec groups records by spec, preserving order', () => {
  const records = [
    { spec: SPEC_A, testName: 'one' },
    { spec: SPEC_B, testName: 'two' },
    { spec: SPEC_A, testName: 'three' },
  ];
  const grouped = groupRecordsBySpec(records);
  assert.deepEqual(
    grouped.get(SPEC_A).map((r) => r.testName),
    ['one', 'three'],
  );
  assert.deepEqual(
    grouped.get(SPEC_B).map((r) => r.testName),
    ['two'],
  );
});

test('toNdjson writes one JSON object per line with a trailing newline', () => {
  const ndjson = toNdjson([{ a: 1 }, { a: 2 }]);
  assert.equal(ndjson, '{"a":1}\n{"a":2}\n');
  assert.deepEqual(
    ndjson
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [{ a: 1 }, { a: 2 }],
  );
});

// ---------------------------------------------------------------------------
// parseAffectedSpecs
// ---------------------------------------------------------------------------

test('parseAffectedSpecs splits newline-delimited specs and drops blank lines', () => {
  assert.deepEqual(
    parseAffectedSpecs(`${SPEC_A}\n\n${SPEC_B}\n`),
    new Set([SPEC_A, SPEC_B]),
  );
});

test('parseAffectedSpecs is defensive against undefined/empty input', () => {
  assert.deepEqual(parseAffectedSpecs(undefined), new Set());
  assert.deepEqual(parseAffectedSpecs(''), new Set());
});

// ---------------------------------------------------------------------------
// canonicalizeSpec / parseManifestSpecs (LS-10337)
// ---------------------------------------------------------------------------

test('canonicalizeSpec maps a bare merge-pass basename to the unique manifest path', () => {
  const known = new Set([SPEC_A, SPEC_B]);
  assert.equal(canonicalizeSpec('a.spec.ts', known), SPEC_A);
  assert.equal(canonicalizeSpec('tests/b.spec.ts', known), SPEC_B);
});

test('canonicalizeSpec keeps an exact known path unchanged', () => {
  assert.equal(canonicalizeSpec(SPEC_A, new Set([SPEC_A, SPEC_B])), SPEC_A);
});

test('canonicalizeSpec leaves unknown and ambiguous specs unchanged', () => {
  const known = new Set([
    SPEC_A,
    'apps/web-e2e/src/integration/tests/a.spec.ts',
  ]);
  assert.equal(canonicalizeSpec('a.spec.ts', known), 'a.spec.ts');
  assert.equal(canonicalizeSpec('zzz.spec.ts', known), 'zzz.spec.ts');
  assert.equal(canonicalizeSpec('a.spec.ts', new Set()), 'a.spec.ts');
  assert.equal(canonicalizeSpec('a.spec.ts', undefined), 'a.spec.ts');
});

test('canonicalizeSpec only matches on a path-segment boundary', () => {
  // "a.spec.ts" must not match ".../extra.spec.ts" via a bare endsWith.
  const known = new Set(['apps/web-e2e/src/tests/extra.spec.ts']);
  assert.equal(canonicalizeSpec('a.spec.ts', known), 'a.spec.ts');
});

test('parseManifestSpecs returns the manifest spec keys and fails open otherwise', () => {
  assert.deepEqual(
    parseManifestSpecs(
      JSON.stringify({ specs: { [SPEC_A]: {}, [SPEC_B]: {} } }),
    ),
    new Set([SPEC_A, SPEC_B]),
  );
  assert.deepEqual(parseManifestSpecs('not json'), new Set());
  assert.deepEqual(
    parseManifestSpecs(JSON.stringify({ specs: [SPEC_A] })),
    new Set(),
  );
  assert.deepEqual(parseManifestSpecs(undefined), new Set());
});
