/**
 * Unit tests for the E2E ledger query helpers (LS-9757). Only the pure
 * parsing/formatting functions are tested here — fetchSpecTimeline's S3
 * calls are exercised via the injected client shape, not a live bucket.
 *
 * Run via: node --test .github/scripts/e2e-ledger/__tests__/*.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fetchSpecTimeline,
  parseNdjson,
  renderTimelineTable,
  sortByTimestamp,
} from '../query-e2e-ledger.mjs';

// ---------------------------------------------------------------------------
// parseNdjson
// ---------------------------------------------------------------------------

test('parseNdjson parses one JSON object per line', () => {
  const records = parseNdjson('{"a":1}\n{"a":2}\n');
  assert.deepEqual(records, [{ a: 1 }, { a: 2 }]);
});

test('parseNdjson skips blank lines and malformed JSON without failing the whole parse', () => {
  const records = parseNdjson('{"a":1}\n\nnot json\n{"a":2}\n');
  assert.deepEqual(records, [{ a: 1 }, { a: 2 }]);
});

test('parseNdjson is defensive against undefined input', () => {
  assert.deepEqual(parseNdjson(undefined), []);
});

// ---------------------------------------------------------------------------
// sortByTimestamp
// ---------------------------------------------------------------------------

test('sortByTimestamp orders oldest to newest', () => {
  const records = [
    { timestamp: '2026-08-30T02:00:00.000Z', id: 'late' },
    { timestamp: '2026-08-30T00:00:00.000Z', id: 'early' },
    { timestamp: '2026-08-30T01:00:00.000Z', id: 'mid' },
  ];
  assert.deepEqual(
    sortByTimestamp(records).map((r) => r.id),
    ['early', 'mid', 'late'],
  );
});

test('sortByTimestamp does not mutate the input array', () => {
  const records = [{ timestamp: 'b' }, { timestamp: 'a' }];
  const copy = [...records];
  sortByTimestamp(records);
  assert.deepEqual(records, copy);
});

// ---------------------------------------------------------------------------
// renderTimelineTable
// ---------------------------------------------------------------------------

test('renderTimelineTable reports no records found for an empty timeline', () => {
  assert.equal(
    renderTimelineTable('apps/web-e2e/src/tests/a.spec.ts', []),
    'No ledger records found for apps/web-e2e/src/tests/a.spec.ts.',
  );
});

test('renderTimelineTable includes every record and labels nightly runs', () => {
  const out = renderTimelineTable('apps/web-e2e/src/tests/a.spec.ts', [
    {
      timestamp: '2026-08-30T00:00:00.000Z',
      sha: 'abcdef1234',
      prNumber: null,
      status: 'flaky',
      retryCount: 1,
      relatedToDiff: null,
      testName: 'flakes sometimes',
    },
  ]);
  assert.match(out, /1 record\(s\)/);
  assert.match(out, /nightly/);
  assert.match(out, /flaky/);
  assert.match(out, /flakes sometimes/);
});

// ---------------------------------------------------------------------------
// fetchSpecTimeline (injected fake S3 client — no live bucket)
// ---------------------------------------------------------------------------

function fakeS3({ pages, objects }) {
  return {
    send: async (command) => {
      const name = command.constructor.name;
      if (name === 'ListObjectsV2Command') {
        const token = command.input.ContinuationToken ?? null;
        const page = pages[token ?? '__first__'];
        return page;
      }
      if (name === 'GetObjectCommand') {
        const body = objects[command.input.Key];
        return {
          Body: (async function* () {
            yield Buffer.from(body);
          })(),
        };
      }
      throw new Error(`unexpected command ${name}`);
    },
  };
}

test('fetchSpecTimeline merges and sorts records across paginated listings', async () => {
  const spec = 'apps/web-e2e/src/tests/a.spec.ts';
  const key1 = `e2e-ledger/v1/spec/${spec}/sha1-1.ndjson`;
  const key2 = `e2e-ledger/v1/spec/${spec}/sha2-2.ndjson`;
  const s3 = fakeS3({
    pages: {
      __first__: {
        Contents: [{ Key: key1 }],
        IsTruncated: true,
        NextContinuationToken: 'page2',
      },
      page2: {
        Contents: [{ Key: key2 }],
        IsTruncated: false,
      },
    },
    objects: {
      [key1]:
        '{"spec":"a","timestamp":"2026-08-30T02:00:00.000Z","testName":"late"}\n',
      [key2]:
        '{"spec":"a","timestamp":"2026-08-30T01:00:00.000Z","testName":"early"}\n',
    },
  });

  const timeline = await fetchSpecTimeline({ s3, bucket: 'test-bucket', spec });
  assert.deepEqual(
    timeline.map((r) => r.testName),
    ['early', 'late'],
  );
});

test('fetchSpecTimeline returns an empty array when no objects match the spec prefix', async () => {
  const s3 = fakeS3({
    pages: { __first__: { Contents: [], IsTruncated: false } },
    objects: {},
  });
  const timeline = await fetchSpecTimeline({
    s3,
    bucket: 'test-bucket',
    spec: 'apps/web-e2e/src/tests/nope.spec.ts',
  });
  assert.deepEqual(timeline, []);
});
