import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatManagerQuotaOverCapError,
  isPersonaOverJoinCap,
} from './global-setup';

// LS-9867: pre-flight quota over-cap detection must fail fast with a clear
// reason instead of letting affected specs time out ~30-50 minutes later.

void test('formatManagerQuotaOverCapError names every over-cap persona with its count', () => {
  const message = formatManagerQuotaOverCapError([
    { persona: 'MANAGER_2', total: 6 },
  ]);
  assert.match(message, /MANAGER_2 \(6\/3\)/);
  assert.match(message, /free-tier league cap/);
});

void test('formatManagerQuotaOverCapError aggregates multiple over-cap personas into one message', () => {
  const message = formatManagerQuotaOverCapError([
    { persona: 'MANAGER_1', total: 3 },
    { persona: 'MANAGER_2', total: 6 },
  ]);
  assert.match(message, /MANAGER_1 \(3\/3\)/);
  assert.match(message, /MANAGER_2 \(6\/3\)/);
});

// LS-10138: the pre-flight predicts whether `joinLeagueByCode` would reject the
// persona's next join, so it must gate on the same thing the mutation gates on
// — the `unlimited_leagues` entitlement — rather than assuming every persona is
// free-tier. MANAGER_2/COMMISSIONER are premium (LS-8057), and capping them
// unconditionally aborted `globalSetup` on every PR.

void test('isPersonaOverJoinCap reports a free-tier persona at exactly the cap', () => {
  // The mutation rejects at `count >= 3`: already holding 3 means the next join
  // would be a disallowed 4th league, so the boundary is inclusive.
  assert.equal(isPersonaOverJoinCap({ entitlements: [], total: 3 }), true);
});

void test('isPersonaOverJoinCap reports a free-tier persona above the cap', () => {
  assert.equal(isPersonaOverJoinCap({ entitlements: [], total: 6 }), true);
});

void test('isPersonaOverJoinCap leaves a free-tier persona below the cap alone', () => {
  assert.equal(isPersonaOverJoinCap({ entitlements: [], total: 2 }), false);
  assert.equal(isPersonaOverJoinCap({ entitlements: [], total: 0 }), false);
});

void test('isPersonaOverJoinCap never reports an unlimited_leagues persona, at or above the cap', () => {
  for (const total of [3, 4, 25]) {
    assert.equal(
      isPersonaOverJoinCap({
        entitlements: ['unlimited_leagues'],
        total,
      }),
      false,
      `premium persona with ${total} leagues must not be reported`,
    );
  }
});

void test('isPersonaOverJoinCap ignores unrelated entitlements when applying the cap', () => {
  // Holding some *other* entitlement must not be mistaken for being uncapped.
  assert.equal(
    isPersonaOverJoinCap({ entitlements: ['advanced_stats'], total: 3 }),
    true,
  );
});

void test('isPersonaOverJoinCap fails open when entitlements could not be read', () => {
  // A failed/stale entitlement read must never abort the whole suite: a missed
  // warning is cheaper than a false positive that stops every spec.
  assert.equal(
    isPersonaOverJoinCap({ entitlements: undefined, total: 9 }),
    false,
  );
});

void test('isPersonaOverJoinCap ignores a missing league count', () => {
  assert.equal(
    isPersonaOverJoinCap({ entitlements: [], total: undefined }),
    false,
  );
});
