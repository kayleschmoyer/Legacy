/**
 * Tests for scripts/check-migrations-applied.js (LS-9599).
 *
 * Run via: node --test scripts/__tests__/check-migrations-applied.test.mjs
 *
 * Covers the two classification branches the CI sticky-comment renderer
 * depends on: a connect/auth/timeout failure (never reached the DB, so no
 * basis for an "unapplied migrations" claim) vs a genuine pending-migration
 * result (connected, compared, found missing files).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import checkMigrationsApplied from '../check-migrations-applied.js';

const { diffMigrations, isInfraError, classifyOutcome, connectWithRetry } =
  checkMigrationsApplied;

// --- diffMigrations ---

test('diffMigrations finds missing and extra hashes', () => {
  const { missing, extra } = diffMigrations({
    appliedHashes: new Set(['a.ts', 'b.ts']),
    migrationFiles: ['a.ts', 'b.ts', 'c.ts'],
  });
  assert.deepEqual(missing, ['c.ts']);
  assert.deepEqual(extra, []);
});

test('diffMigrations reports applied hashes with no matching file as extra', () => {
  const { missing, extra } = diffMigrations({
    appliedHashes: ['a.ts', 'z.ts'],
    migrationFiles: ['a.ts'],
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, ['z.ts']);
});

// --- isInfraError ---

test('isInfraError recognizes connect timeout by code', () => {
  const err = Object.assign(new Error('connect ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });
  assert.equal(isInfraError(err), true);
});

test('isInfraError recognizes the pg client "timeout expired" message', () => {
  assert.equal(isInfraError(new Error('timeout expired')), true);
});

test('isInfraError recognizes ECONNREFUSED', () => {
  const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });
  assert.equal(isInfraError(err), true);
});

test('isInfraError recognizes password auth failures', () => {
  const err = Object.assign(
    new Error('password authentication failed for user "ci_readonly"'),
    { code: '28P01' },
  );
  assert.equal(isInfraError(err), true);
});

test('isInfraError returns false for an unrelated query error', () => {
  const err = new Error(
    'relation "drizzle.__drizzle_migrations" does not exist',
  );
  assert.equal(isInfraError(err), false);
});

// --- classifyOutcome (the two branches the renderer depends on) ---

test('classifyOutcome: connect/timeout failure classifies as infra, not pending', () => {
  const err = Object.assign(new Error('timeout expired'), {
    code: 'ETIMEDOUT',
  });
  const outcome = classifyOutcome({ err });
  assert.equal(outcome.status, 'infra');
  assert.equal(outcome.message, 'timeout expired');
});

test('classifyOutcome: genuine pending migrations classifies as pending with names', () => {
  const outcome = classifyOutcome({
    missing: ['20260101_000000_add_widgets.ts'],
  });
  assert.equal(outcome.status, 'pending');
  assert.deepEqual(outcome.missing, ['20260101_000000_add_widgets.ts']);
});

test('classifyOutcome: no error and nothing missing is ok', () => {
  assert.deepEqual(classifyOutcome({ missing: [] }), { status: 'ok' });
});

test('classifyOutcome: a non-infra error is classified as error, never pending', () => {
  const outcome = classifyOutcome({
    err: new Error('relation does not exist'),
  });
  assert.equal(outcome.status, 'error');
});

// --- connectWithRetry ---

/** Build a fake pg.Client whose connect() fails `failCount` times, then succeeds. */
function fakeClientFactory({ failCount, err }) {
  let calls = 0;
  const madeClients = [];
  const createClient = () => {
    calls += 1;
    const attempt = calls;
    const client = {
      attempt,
      ended: false,
      connect: async () => {
        if (attempt <= failCount) throw err;
      },
      end: async () => {
        client.ended = true;
      },
    };
    madeClients.push(client);
    return client;
  };
  return { createClient, madeClients, callCount: () => calls };
}

test('connectWithRetry retries an infra error and succeeds on a later attempt', async () => {
  const timeoutErr = Object.assign(new Error('timeout expired'), {
    code: 'ETIMEDOUT',
  });
  const { createClient, madeClients, callCount } = fakeClientFactory({
    failCount: 1,
    err: timeoutErr,
  });
  const sleeps = [];

  const client = await connectWithRetry(
    {},
    {
      retries: 3,
      baseDelayMs: 10,
      sleep: async (ms) => sleeps.push(ms),
      createClient,
    },
  );

  assert.equal(callCount(), 2);
  assert.equal(client.attempt, 2);
  assert.deepEqual(sleeps, [10]); // one retry, backoff = baseDelayMs * attempt 1
  assert.equal(madeClients[0].ended, true); // failed attempt's client was closed
});

test('connectWithRetry gives up after exhausting retries and throws the last error', async () => {
  const timeoutErr = Object.assign(new Error('timeout expired'), {
    code: 'ETIMEDOUT',
  });
  const { createClient, callCount } = fakeClientFactory({
    failCount: 5,
    err: timeoutErr,
  });

  await assert.rejects(
    () =>
      connectWithRetry(
        {},
        { retries: 3, baseDelayMs: 1, sleep: async () => {}, createClient },
      ),
    (thrown) => thrown === timeoutErr,
  );
  assert.equal(callCount(), 3);
});

test('connectWithRetry does not retry a non-infra error', async () => {
  const authErr = new Error('relation does not exist');
  const { createClient, callCount } = fakeClientFactory({
    failCount: 5,
    err: authErr,
  });

  await assert.rejects(
    () =>
      connectWithRetry(
        {},
        { retries: 3, baseDelayMs: 1, sleep: async () => {}, createClient },
      ),
    (thrown) => thrown === authErr,
  );
  assert.equal(callCount(), 1);
});
