/**
 * Unit tests for the native route-parity seam (ADR-0016 amendment — LS-9653).
 *
 * Pure, hermetic node:test cases — no emulator, no WebdriverIO session. They
 * pin the neutral-path → native-deep-link-path translation the seam
 * (LS-9653) recommends, so a regression here fails in `pc-test`, not on a
 * device days later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveNativeRoute,
  UnmappedNativeRouteError,
} from './native-route-map';

// ---------------------------------------------------------------------------
// Tab-addressed league routes (AC1, AC2)
// ---------------------------------------------------------------------------

void test('resolveNativeRoute: rewrites a tab-addressed football league route to initialTab', () => {
  assert.equal(
    resolveNativeRoute('/football/league/1/roster'),
    '/football/league/1?initialTab=roster',
  );
});

void test('resolveNativeRoute: rewrites a tab-addressed baseball league route to initialTab', () => {
  assert.equal(
    resolveNativeRoute('/baseball/league/42/standings'),
    '/baseball/league/42?initialTab=standings',
  );
});

void test('resolveNativeRoute: baseball-only "history" tab resolves for baseball', () => {
  assert.equal(
    resolveNativeRoute('/baseball/league/7/history'),
    '/baseball/league/7?initialTab=history',
  );
});

void test('resolveNativeRoute: "history" is not a valid football tab and fails loudly', () => {
  assert.throws(
    () => resolveNativeRoute('/football/league/7/history'),
    UnmappedNativeRouteError,
  );
});

void test('resolveNativeRoute: an unrecognized tab fails loudly with a diagnostic', () => {
  assert.throws(
    () => resolveNativeRoute('/baseball/league/1/nonexistent'),
    (error: unknown) => {
      assert.ok(error instanceof UnmappedNativeRouteError);
      assert.match(error.message, /nonexistent/);
      assert.match(error.message, /native-route-map\.ts/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Draft — a dedicated screen, not a LeagueDetailShell tab
// ---------------------------------------------------------------------------

void test('resolveNativeRoute: rewrites the draft board route to its own screen', () => {
  assert.equal(
    resolveNativeRoute('/baseball/league/7/draft'),
    '/DraftBoardPage?leagueId=7',
  );
  assert.equal(
    resolveNativeRoute('/football/league/3/draft'),
    '/DraftBoardPage?leagueId=3',
  );
});

void test('resolveNativeRoute: rewrites the draft watch route to its own screen', () => {
  assert.equal(
    resolveNativeRoute('/baseball/league/7/draft/watch'),
    '/DraftWatchPage?leagueId=7',
  );
});

// ---------------------------------------------------------------------------
// League discovery (AC3)
// ---------------------------------------------------------------------------

void test('resolveNativeRoute: sport-scoped discovery collapses to the one native screen', () => {
  assert.equal(resolveNativeRoute('/football/leagues'), '/league-discovery');
  assert.equal(resolveNativeRoute('/baseball/leagues'), '/league-discovery');
});

// ---------------------------------------------------------------------------
// Passthrough — most routes are already URL-shaped on both platforms
// ---------------------------------------------------------------------------

void test('resolveNativeRoute: a bare league-detail route (no tab) passes through unchanged', () => {
  assert.equal(resolveNativeRoute('/football/league/1'), '/football/league/1');
});

void test('resolveNativeRoute: non-league routes pass through unchanged', () => {
  assert.equal(
    resolveNativeRoute('/football/league/create'),
    '/football/league/create',
  );
  assert.equal(
    resolveNativeRoute('/football/players/123'),
    '/football/players/123',
  );
  assert.equal(
    resolveNativeRoute('/dev/driver-contract'),
    '/dev/driver-contract',
  );
});

void test('resolveNativeRoute: tolerates a path with no leading slash', () => {
  assert.equal(
    resolveNativeRoute('football/league/1/roster'),
    '/football/league/1?initialTab=roster',
  );
});
