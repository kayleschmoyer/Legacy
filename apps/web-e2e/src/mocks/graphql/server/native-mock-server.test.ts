/**
 * Unit tests for the per-worker native GraphQL mock server (ADR-0017 —
 * LS-8448). Pure, hermetic node:test cases — a real HTTP server on loopback, no
 * emulator, no WebdriverIO. They prove the *server side* of AC2/AC3/AC4
 * deterministically: operation-name-keyed factory reuse, per-test overrides
 * (incl. the server-side discovery search the login→league-list proof issues),
 * loud subscription rejection, and unmocked-operation recording.
 *
 * Run via the web-e2e `test` target (`tsx --test apps/web-e2e/src/**\/*.test.ts`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GraphQLMockServer,
  isSubscriptionDocument,
  parseGraphQLBody,
  subscriptionRejectionBody,
} from './native-mock-server';
import {
  createNativeMockServer,
  NativeMockTestData,
  REALTIME_LIVE_ONLY_REASON,
  realtimeUnavailable,
} from '../../../fixtures/native-mock';

/** POST a GraphQL operation to the running server and return the parsed JSON. */
async function post<T = unknown>(
  url: string,
  body: { operationName: string; query?: string; variables?: unknown },
): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

/** Minimal shapes the assertions below read off the GraphQL responses. */
type PublicLeaguesResult = { data: { publicLeagues: unknown[] } };
type SubscriptionRejection = {
  data: null;
  errors: { message: string; extensions: { code: string } }[];
};

// ---------------------------------------------------------------------------
// parseGraphQLBody — operation-name extraction (body + ?ref= fallback)
// ---------------------------------------------------------------------------

void test('parseGraphQLBody: reads operationName from the JSON body', () => {
  const req = parseGraphQLBody(
    JSON.stringify({ operationName: 'GetUserById', variables: { id: 1 } }),
    '/graphql?ref=GetUserById',
  );
  assert.equal(req.operationName, 'GetUserById');
  assert.equal(req.op, 'getuserbyid');
  assert.deepEqual(req.variables, { id: 1 });
});

void test('parseGraphQLBody: falls back to the ?ref= query param', () => {
  // The native DbClient appends ?ref=<op>; body without operationName still resolves.
  const req = parseGraphQLBody('{}', '/graphql?ref=GetPublicLeagues');
  assert.equal(req.operationName, 'GetPublicLeagues');
  assert.equal(req.op, 'getpublicleagues');
});

// ---------------------------------------------------------------------------
// isSubscriptionDocument (AC4)
// ---------------------------------------------------------------------------

void test('isSubscriptionDocument: detects subscriptions, ignores query/mutation', () => {
  assert.equal(isSubscriptionDocument('subscription OnDraftPick { x }'), true);
  assert.equal(
    isSubscriptionDocument('  # comment\n subscription S { x }'),
    true,
  );
  assert.equal(isSubscriptionDocument('query GetX { x }'), false);
  assert.equal(isSubscriptionDocument('mutation M { x }'), false);
  // "subscription" as a field name, not an operation type, is not a subscription.
  assert.equal(isSubscriptionDocument('query Q { subscription }'), false);
});

// ---------------------------------------------------------------------------
// Server: baseline, overrides, unmocked, subscription rejection
// ---------------------------------------------------------------------------

void test('server: serves a baseline operation, records unmocked ones', async () => {
  const server = new GraphQLMockServer({
    baseline: { getleague: { data: { league: { id: 7 } } } },
  });
  await server.start();
  try {
    const hit = await post(server.url, { operationName: 'GetLeague' });
    assert.equal(hit.status, 200);
    assert.deepEqual(hit.json, { data: { league: { id: 7 } } });

    const miss = await post(server.url, { operationName: 'GetSomethingElse' });
    assert.deepEqual(miss.json, { data: {} }, 'unmocked returns empty data');
    assert.deepEqual(server.unmockedOperations, ['GetSomethingElse']);
  } finally {
    await server.stop();
  }
});

void test('server: an override wins over the baseline and reset clears it', async () => {
  const server = new GraphQLMockServer({
    baseline: { getleague: { data: { league: { id: 1 } } } },
  });
  await server.start();
  try {
    server.override('GetLeague', () => ({ data: { league: { id: 99 } } }));
    const overridden = await post(server.url, { operationName: 'GetLeague' });
    assert.deepEqual(overridden.json, { data: { league: { id: 99 } } });

    server.reset();
    const afterReset = await post(server.url, { operationName: 'GetLeague' });
    assert.deepEqual(afterReset.json, { data: { league: { id: 1 } } });
  } finally {
    await server.stop();
  }
});

void test('server: rejects subscriptions loudly (AC4), never empty data', async () => {
  const server = new GraphQLMockServer();
  await server.start();
  try {
    const res = await post<SubscriptionRejection>(server.url, {
      operationName: 'OnDraftPick',
      query: 'subscription OnDraftPick { draftPick { id } }',
    });
    assert.equal(res.json.data, null);
    assert.equal(
      res.json.errors[0].extensions.code,
      'SUBSCRIPTIONS_NOT_SUPPORTED',
    );
    // Not recorded as "unmocked" — it is a deliberate, explicit rejection.
    assert.deepEqual(server.unmockedOperations, []);
  } finally {
    await server.stop();
  }
});

void test('server: /__mock/health readiness probe returns ok', async () => {
  const server = new GraphQLMockServer();
  await server.start();
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/__mock/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// NativeMockTestData over the real baseline — the login → league-list proof
// (AC2/AC3): factory reuse + server-side discovery search, no forked fixtures.
// ---------------------------------------------------------------------------

void test('NativeMockTestData.discoverySearch: server-side empty/populated by term', async () => {
  const server = createNativeMockServer();
  await server.start();
  try {
    const testData = new NativeMockTestData(server);
    const { unmatchedTerm } = await testData.discoverySearch();

    // Cold "login → league list" surface load (no search term) → two leagues.
    const populated = await post<PublicLeaguesResult>(server.url, {
      operationName: 'GetPublicLeagues',
      variables: {},
    });
    assert.equal(populated.json.data.publicLeagues.length, 2);

    // The unmatched search term → empty result (drives the empty state).
    const empty = await post<PublicLeaguesResult>(server.url, {
      operationName: 'GetPublicLeagues',
      variables: { search: unmatchedTerm },
    });
    assert.equal(empty.json.data.publicLeagues.length, 0);
  } finally {
    await server.stop();
  }
});

void test('NativeMockTestData: baseline still serves ambient ops (e.g. GetUserById)', async () => {
  const server = createNativeMockServer();
  await server.start();
  try {
    // The proof flow's authenticated shell issues GetUserById; the shared
    // baseline answers it with no per-test override needed.
    const res = await post<{ data: unknown }>(server.url, {
      operationName: 'GetUserById',
      variables: { id: 1 },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.data, 'GetUserById resolves from the baseline');
    assert.deepEqual(
      server.unmockedOperations,
      [],
      'a baseline op is never recorded as unmocked',
    );
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------
// realtimeUnavailable — the AC4 capability gate
// ---------------------------------------------------------------------------

void test('realtimeUnavailable: only native + mock gates WS flows live-only', () => {
  assert.equal(
    realtimeUnavailable({ platform: 'native', backend: 'mock' }),
    true,
  );
  assert.equal(
    realtimeUnavailable({ platform: 'native', backend: 'live' }),
    false,
  );
  assert.equal(
    realtimeUnavailable({ platform: 'web', backend: 'mock' }),
    false,
  );
  assert.match(REALTIME_LIVE_ONLY_REASON, /live-only on native/);
});

void test('subscriptionRejectionBody: carries the explicit code + op name', () => {
  const body = subscriptionRejectionBody('OnDraftPick');
  assert.equal(body.data, null);
  assert.equal(body.errors[0].extensions.code, 'SUBSCRIPTIONS_NOT_SUPPORTED');
  assert.match(body.errors[0].message, /OnDraftPick/);
});
