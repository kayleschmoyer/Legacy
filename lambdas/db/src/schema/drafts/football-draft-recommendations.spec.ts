/**
 * Tests for getFootballDraftRecommendations (LS-9482).
 *
 * getDraftRecommendations previously gated its player pool on
 * player_eligible_positions, which has zero football rows (LS-9474
 * postmortem) — so the Draft Intelligence panel silently returned no
 * recommendations for every football draft. This exercises the extracted
 * football branch directly (a plain exported function, not a captured
 * resolver); entitlement/auth gating for getDraftRecommendations itself is
 * already covered by draft-recommendations.resolver.spec.ts.
 *
 * Uses the REAL drizzle-orm `sql` tagged template (not mocked) so the
 * assembled queries can be rendered and asserted on, and the REAL
 * strategies/football.ts (effectiveFootballFpg) so the archetype-baseline
 * fallback is genuinely exercised rather than stubbed.
 *
 * Test list:
 *   1. Queries football_player_eligible_positions, never player_eligible_positions
 *   2. Excludes already-drafted / already-rostered players
 *   3. Skips the roster-position query when the team has no picks yet
 *   4. Returns non-empty recommendations even with no served FPG projection
 *      (the core LS-9482 bug: the old code returned [] here)
 *   5. Never labels the archetype baseline as a "Proj FPG" stat (LS-9476)
 *   6. Shows "Proj FPG" only when a real projection was served
 *   7. Does not claim to fill an already-filled position
 *   8. Returns at most 5 recommendations
 */

import { PgDialect } from 'drizzle-orm/pg-core';

async function loadQueriesModule(): Promise<typeof import('./queries')> {
  jest.resetModules();

  jest.doMock('../builder', () => ({
    builder: { queryField: jest.fn(), mutationField: jest.fn() },
  }));

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      drafts: { id: 'id', leagueId: 'leagueId' },
      draftPicks: {
        draftId: 'draftId',
        playerId: 'playerId',
        teamId: 'teamId',
      },
      leagues: { id: 'id', sport: 'sport' },
    },
    buildEligibilityConditions: jest.fn(),
  }));

  jest.doMock('./types', () => ({
    CurrentDraftPick: {},
    Draft: {},
    DraftFootballPlayerStats: {},
    DraftPick: {},
    DraftPlayer: {},
    DraftQueueEntry: {},
    DraftRecommendation: {},
    DraftTeamAutoPickStatus: {},
    DraftTeamOrderEntry: {},
    MockDraftUsage: {},
  }));

  jest.doMock('./helpers', () => ({
    getCurrentDraftPickInfo: jest.fn(),
    countRecentMockDrafts: jest.fn(),
    eligibleStatPositionsForUnfilledSlots: jest.fn(),
    getUnfilledPositionTypes: jest.fn(),
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  jest.doMock('../authorization', () => ({
    hasEntitlement: jest.fn(),
    requireEntitlement: jest.fn(),
    isCommissionerOrOwner: jest.fn(),
    verifyLeagueMembership: jest.fn(),
    verifyLeagueReadAccess: jest.fn(),
  }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: {
      unlimited_mock_drafts: 'unlimited_mock_drafts',
      draft_recommendations: 'draft_recommendations',
    },
  }));

  jest.doMock('../graphql-errors', () => ({
    AuthenticationError: jest.fn(),
    ForbiddenError: jest.fn(),
    UserInputError: jest.fn(),
  }));

  jest.doMock('../leagues/delete-resilience', () => ({
    describeDbError: jest.fn(),
    formatDbError: jest.fn(),
    withTransientRetry: jest.fn(),
  }));

  // Real drizzle-orm and real strategies/football.ts — this test exercises
  // genuine SQL assembly and the genuine effectiveFootballFpg fallback,
  // neither of which are meaningfully testable through a mock.
  return import('./queries');
}

type FootballRow = {
  player_id: number;
  first_name: string;
  last_name: string;
  primary_position: string;
  projected_fantasy_points: number | null;
};

type RosterRow = { player_id: number; position: string };

/** Chainable db.execute stub returning one canned row-set per call, in order. */
function makeDb(callResults: Array<Array<FootballRow | RosterRow>>) {
  const calls: unknown[] = [];
  let call = 0;
  const execute = jest.fn((query: unknown) => {
    calls.push(query);
    const rows = callResults[call] ?? [];
    call += 1;
    return Promise.resolve({ rows });
  });
  return { db: { execute }, calls };
}

function renderQuery(query: unknown) {
  return new PgDialect().sqlToQuery(
    query as Parameters<PgDialect['sqlToQuery']>[0],
  );
}

describe('getFootballDraftRecommendations (LS-9482)', () => {
  it('queries football_player_eligible_positions, never the baseball player_eligible_positions table', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const { db, calls } = makeDb([[]]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [],
      'dst',
    );

    expect(result).toEqual([]);
    const { sql: text } = renderQuery(calls[0]);
    expect(text).toContain('public.football_player_eligible_positions');
    // Exclusive: the literal baseball table reference must never appear —
    // not "does the text mention football somewhere" (LS-9474 postmortem:
    // a naive toContain('player_eligible_positions') passes for both
    // tables since one name is a substring of the other).
    expect(text).not.toContain('public.player_eligible_positions');
  });

  it('excludes players already drafted or already rostered in this league', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const { db, calls } = makeDb([[]]);

    await getFootballDraftRecommendations(db as never, 1, 10, [], 'dst');

    const { sql: text } = renderQuery(calls[0]);
    expect(text).toContain('draft_picks');
    expect(text).toContain('team_members');
  });

  it('does not query roster positions when the team has no picks yet', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const { db } = makeDb([[]]);

    await getFootballDraftRecommendations(db as never, 1, 10, [], 'dst');

    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('returns non-empty recommendations even when no candidate has a served FPG projection', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const rows: FootballRow[] = [
      {
        player_id: 1,
        first_name: 'Pat',
        last_name: 'Mahomes',
        primary_position: 'QB',
        projected_fantasy_points: null,
      },
      {
        player_id: 2,
        first_name: 'Christian',
        last_name: 'McCaffrey',
        primary_position: 'RB',
        projected_fantasy_points: null,
      },
    ];
    const { db } = makeDb([rows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [],
      'dst',
    );

    expect(result).toHaveLength(2);
  });

  it('never labels the archetype baseline as a projected FPG stat', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const rows: FootballRow[] = [
      {
        player_id: 1,
        first_name: 'A',
        last_name: 'Rookie',
        primary_position: 'QB',
        projected_fantasy_points: null,
      },
    ];
    const { db } = makeDb([rows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [],
      'dst',
    );

    expect(result[0].topStats.some((s) => s.label === 'Proj FPG')).toBe(false);
  });

  it('shows the served FPG as a topStat only when a real projection exists', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const rows: FootballRow[] = [
      {
        player_id: 1,
        first_name: 'A',
        last_name: 'Star',
        primary_position: 'QB',
        projected_fantasy_points: 22.5,
      },
    ];
    const { db } = makeDb([rows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [],
      'dst',
    );

    expect(result[0].topStats).toContainEqual({
      label: 'Proj FPG',
      value: '22.5',
    });
  });

  it('does not claim to fill an already-filled position', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const candidateRows: FootballRow[] = [
      {
        player_id: 2,
        first_name: 'Backup',
        last_name: 'QB',
        primary_position: 'QB',
        projected_fantasy_points: 20,
      },
    ];
    const rosterRows: RosterRow[] = [{ player_id: 99, position: 'QB' }];
    const { db } = makeDb([candidateRows, rosterRows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [99],
      'dst',
    );

    expect(result[0].reason).not.toMatch(/Fills your empty QB slot/);
  });

  // LS-9475: roster-slot quotas must reflect the league's actual
  // defensiveFormat — a 'dst' league has no DL quota at all (falls back to
  // 1), an 'idp' league expects 2 DL. The same roster state (one drafted DL)
  // must therefore be scored differently by format.
  it('scores positional need against the dst roster shape (no DL quota) for a dst league', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const candidateRows: FootballRow[] = [
      {
        player_id: 2,
        first_name: 'Backup',
        last_name: 'DL',
        primary_position: 'DL',
        projected_fantasy_points: 20,
      },
    ];
    const rosterRows: RosterRow[] = [{ player_id: 99, position: 'DL' }];
    const { db } = makeDb([candidateRows, rosterRows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [99],
      'dst',
    );

    // dst's roster shape has no DL slot at all — quota falls back to 1, and
    // the team already has 1, so this reads as fully covered, not "adds depth".
    expect(result[0].reason).not.toMatch(/Adds depth/);
  });

  it('scores positional need against the idp roster shape (2x DL quota) for an idp league', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const candidateRows: FootballRow[] = [
      {
        player_id: 2,
        first_name: 'Backup',
        last_name: 'DL',
        primary_position: 'DL',
        projected_fantasy_points: 20,
      },
    ];
    const rosterRows: RosterRow[] = [{ player_id: 99, position: 'DL' }];
    const { db } = makeDb([candidateRows, rosterRows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [99],
      'idp',
    );

    // idp's roster shape has 2 DL slots — the team has 1, so this is still
    // an open need, and the same roster state scores differently than dst.
    expect(result[0].reason).toMatch(/Adds depth at DL/);
  });

  it('returns at most 5 recommendations', async () => {
    const { getFootballDraftRecommendations } = await loadQueriesModule();
    const rows: FootballRow[] = Array.from({ length: 8 }, (_, i) => ({
      player_id: i + 1,
      first_name: 'Player',
      last_name: String(i),
      primary_position: 'WR',
      projected_fantasy_points: i * 2,
    }));
    const { db } = makeDb([rows]);

    const result = await getFootballDraftRecommendations(
      db as never,
      1,
      10,
      [],
      'dst',
    );

    expect(result).toHaveLength(5);
  });
});

export {};
