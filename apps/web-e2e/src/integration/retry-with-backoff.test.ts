/**
 * Unit tests for the shared live-call backoff helper (LS-7866).
 *
 * Pure, hermetic node:test cases — no real network, no real timers. `fetch` and
 * `sleep` are injected so the exponential schedule and Retry-After honouring are
 * asserted deterministically. Run via the web-e2e `test` target
 * (`tsx --test apps/web-e2e/src/integration/**\/*.test.ts`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffMs,
  fetchWithBackoff,
  parseRetryAfterMs,
  retryWithBackoff,
} from '../utils/retry-with-backoff';

// ---------------------------------------------------------------------------
// parseRetryAfterMs
// ---------------------------------------------------------------------------

void test('parseRetryAfterMs: delta-seconds → ms', () => {
  assert.equal(parseRetryAfterMs('60'), 60_000);
  assert.equal(parseRetryAfterMs('0'), 0);
  assert.equal(parseRetryAfterMs(' 5 '), 5_000);
});

void test('parseRetryAfterMs: absent / unparseable → undefined', () => {
  assert.equal(parseRetryAfterMs(null), undefined);
  assert.equal(parseRetryAfterMs(undefined), undefined);
  assert.equal(parseRetryAfterMs(''), undefined);
  assert.equal(parseRetryAfterMs('not-a-date'), undefined);
});

void test('parseRetryAfterMs: HTTP-date → ms until that date', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const future = 'Thu, 01 Jan 2026 00:00:30 GMT';
  assert.equal(parseRetryAfterMs(future, now), 30_000);
  // A past date clamps to 0 (retry immediately).
  const past = 'Wed, 31 Dec 2025 23:59:00 GMT';
  assert.equal(parseRetryAfterMs(past, now), 0);
});

// ---------------------------------------------------------------------------
// computeBackoffMs
// ---------------------------------------------------------------------------

void test('computeBackoffMs: exponential schedule with jitter=1 (no Retry-After)', () => {
  const opts = { baseDelayMs: 500, maxDelayMs: 32_000, jitter: () => 1 };
  assert.equal(computeBackoffMs(1, undefined, opts), 500);
  assert.equal(computeBackoffMs(2, undefined, opts), 1_000);
  assert.equal(computeBackoffMs(3, undefined, opts), 2_000);
  assert.equal(computeBackoffMs(4, undefined, opts), 4_000);
});

void test('computeBackoffMs: exponential is capped at maxDelayMs', () => {
  const opts = { baseDelayMs: 1_000, maxDelayMs: 8_000, jitter: () => 1 };
  assert.equal(computeBackoffMs(10, undefined, opts), 8_000);
});

void test('computeBackoffMs: full jitter scales the capped delay', () => {
  const opts = { baseDelayMs: 1_000, maxDelayMs: 32_000, jitter: () => 0.5 };
  // attempt 3 → 1000 * 2^2 = 4000, * 0.5 jitter = 2000
  assert.equal(computeBackoffMs(3, undefined, opts), 2_000);
});

void test('computeBackoffMs: honours Retry-After, clamped to maxRetryAfterMs', () => {
  assert.equal(
    computeBackoffMs(1, 10_000, { maxRetryAfterMs: 60_000 }),
    10_000,
  );
  // A 300 s lockout is clamped so a worker never blocks past the spec timeout.
  assert.equal(
    computeBackoffMs(1, 300_000, { maxRetryAfterMs: 60_000 }),
    60_000,
  );
});

// ---------------------------------------------------------------------------
// retryWithBackoff (generic core)
// ---------------------------------------------------------------------------

void test('retryWithBackoff: retries until classify says stop', async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const result = await retryWithBackoff(
    () => {
      calls += 1;
      return Promise.resolve(calls);
    },
    (n) => ({ retry: n < 3 }),
    { sleep: (ms) => (sleeps.push(ms), Promise.resolve()), jitter: () => 1 },
  );
  assert.equal(result, 3);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [500, 1_000]); // two waits before the 3rd attempt
});

void test('retryWithBackoff: stops at maxAttempts even if classify still wants retry', async () => {
  let calls = 0;
  const result = await retryWithBackoff(
    () => {
      calls += 1;
      return Promise.resolve(calls);
    },
    () => ({ retry: true }),
    { maxAttempts: 4, sleep: () => Promise.resolve(), jitter: () => 1 },
  );
  assert.equal(result, 4);
  assert.equal(calls, 4);
});

void test('retryWithBackoff: retries transient network errors then rethrows', async () => {
  let calls = 0;
  await assert.rejects(
    retryWithBackoff(
      () => {
        calls += 1;
        return Promise.reject(new Error('Failed to fetch'));
      },
      () => ({ retry: false }),
      { maxAttempts: 3, sleep: () => Promise.resolve(), jitter: () => 1 },
    ),
    /Failed to fetch/,
  );
  assert.equal(calls, 3);
});

// ---------------------------------------------------------------------------
// fetchWithBackoff
// ---------------------------------------------------------------------------

function makeResponse(status: number, retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) headers.set('retry-after', retryAfter);
  return new Response(status === 204 ? null : 'body', { status, headers });
}

void test('fetchWithBackoff: retries 429 honouring Retry-After, returns the 200', async () => {
  const statuses = [429, 429, 200];
  const sleeps: number[] = [];
  let i = 0;
  const res = await fetchWithBackoff(
    'https://api.test/graphql',
    {},
    {
      fetchImpl: ((..._args: Parameters<typeof fetch>) =>
        Promise.resolve(
          makeResponse(statuses[i], statuses[i++] === 429 ? '2' : undefined),
        )) as typeof fetch,
      sleep: (ms) => (sleeps.push(ms), Promise.resolve()),
      jitter: () => 1,
    },
  );
  assert.equal(res.status, 200);
  // Both 429s carried Retry-After: 2 → honoured as 2_000 ms each.
  assert.deepEqual(sleeps, [2_000, 2_000]);
});

void test('fetchWithBackoff: non-429 status returned immediately (no retry)', async () => {
  let calls = 0;
  const res = await fetchWithBackoff(
    'https://api.test/graphql',
    {},
    {
      fetchImpl: (() => {
        calls += 1;
        return Promise.resolve(makeResponse(400));
      }) as typeof fetch,
      sleep: () => Promise.resolve(),
    },
  );
  assert.equal(res.status, 400);
  assert.equal(calls, 1);
});

void test('fetchWithBackoff: retries transient 5xx then returns the 200', async () => {
  const statuses = [503, 502, 200];
  let i = 0;
  const res = await fetchWithBackoff(
    'https://api.test/graphql',
    {},
    {
      fetchImpl: (() =>
        Promise.resolve(makeResponse(statuses[i++]))) as typeof fetch,
      sleep: () => Promise.resolve(),
      jitter: () => 1,
    },
  );
  assert.equal(res.status, 200);
  assert.equal(i, 3);
});

void test('fetchWithBackoff: gives up after maxAttempts of 429', async () => {
  let calls = 0;
  const res = await fetchWithBackoff(
    'https://api.test/graphql',
    {},
    {
      maxAttempts: 3,
      fetchImpl: (() => {
        calls += 1;
        return Promise.resolve(makeResponse(429));
      }) as typeof fetch,
      sleep: () => Promise.resolve(),
      jitter: () => 1,
    },
  );
  assert.equal(res.status, 429);
  assert.equal(calls, 3);
});
