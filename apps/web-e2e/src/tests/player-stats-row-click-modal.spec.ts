/**
 * E2E Tests: Player Stats — Row Click Opens Player Detail Modal (LS-5595)
 *
 * Covers the "Feature: Row Click Opens Player Detail Modal" QA story (child of
 * LS-5288). All GraphQL calls are mocked so this suite runs without a live
 * backend.
 *
 * Journey under test:
 *   1. Navigate to /players/stats (batting tab, mocked data).
 *   2. Click a player row → modal opens.
 *   3. Modal shows the player's name.
 *   4. URL gains ?playerId=<id>.
 *   5. Dismissing (× or Escape) closes the modal.
 *   6. URL loses ?playerId after dismissal.
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import { tierEntitlementsResponse } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

/** Single batting row so the stats grid renders Barry Bonds (playerId=101). */
const BATTING_STATS_RESPONSE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 1,
      edges: [
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 101,
            primaryPosition: 'LF',
            positionsPlayed: 'LF,RF',
            games: 2986,
            plateAppearances: 12606,
            atBats: 9847,
            runs: 2227,
            hits: 2935,
            doubles: 601,
            triples: 77,
            homeRuns: 762,
            rbi: 1996,
            stolenBases: 514,
            caughtStealing: 141,
            baseOnBalls: 2558,
            strikeouts: 1539,
            totalBases: 5976,
            groundedIntoDoublePlays: 144,
            hitByPitch: 95,
            sacrificeHits: 24,
            intentionalBaseOnBalls: 688,
            battingAverage: 0.298,
            onBasePercentage: 0.444,
            sluggingPercentage: 0.607,
            offensiveWAR: 162.8,
            player: {
              __typename: 'Player',
              id: 101,
              firstName: 'Barry',
              lastName: 'Bonds',
              brefId: 'bondsba01',
            },
          },
        },
      ],
      pageInfo: MOCK_PAGE_INFO,
    },
  },
};

/** Season stats returned when the modal loads for playerId=101. */
const BONDS_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['LF', 'OF'],
      firstName: 'Barry',
      lastName: 'Bonds',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2004,
        team: 'SFG',
        games: 147,
        plateAppearances: 617,
        atBats: 373,
        runs: 129,
        hits: 135,
        doubles: 27,
        triples: 3,
        homeRuns: 45,
        rbi: 101,
        stolenBases: 6,
        caughtStealing: 1,
        baseOnBalls: 232,
        strikeouts: 41,
        battingAverage: 0.362,
        onBasePercentage: 0.609,
        sluggingPercentage: 0.812,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Career arc stub so arc queries resolve without errors. */
const BONDS_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Barry',
      lastName: 'Bonds',
      eligiblePositions: ['LF', 'OF'],
      careerAchievements: {
        allStarSelections: 14,
        goldGloves: 8,
        silverSluggers: 12,
        mvpAwards: 7,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [
      {
        season: 2004,
        team: 'SFG',
        games: 147,
        hits: 135,
        atBats: 373,
        homeRuns: 45,
        rbi: 101,
        stolenBases: 6,
        battingAverage: 0.362,
        onBasePercentage: 0.609,
        sluggingPercentage: 0.812,
        onBasePlusSlugging: 1.421,
        onBasePlusSluggingPlus: 263,
        awardSummary: null,
      },
    ],
    arcPitching: [],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Premium user response — mirrors `tierUserByIdResponse('premium')` from
 * shared-mocks. Inlined here so `isPremium` resolves immediately via
 * `route.fulfill()` rather than going through the `_apiIsolation` fallback
 * chain, which can race with the row click on cold CI workers.
 */
const USER_BY_ID_PREMIUM = {
  data: {
    user: {
      __typename: 'User',
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      name: 'Test User',
      accessLevel: 'none',
      avatarUrl: null,
      subscriptionTier: 'premium',
      themePreference: null,
    },
  },
};

/** Free-tier user — mirrors `tierUserByIdResponse('free')` from shared-mocks. */
const USER_BY_ID_FREE = {
  data: {
    user: {
      __typename: 'User',
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      name: 'Test User',
      accessLevel: 'none',
      avatarUrl: null,
      subscriptionTier: null,
      themePreference: null,
    },
  },
};

async function setupMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getuserbyid: (route) => fulfillJson(route, USER_BY_ID_PREMIUM),
    // The modal gate reads `useHasEntitlement` → `MyEntitlements` (LS-8645),
    // not `GetUserById.subscriptionTier` — mock it alongside the user record
    // so the entitlement pair stays consistent and resolves immediately.
    myentitlements: (route) =>
      fulfillJson(route, tierEntitlementsResponse('premium')),
    getcareerbattingstats: (route) =>
      fulfillJson(route, BATTING_STATS_RESPONSE),
    getcareerpitchingstatscount: (route) =>
      fulfillJson(route, { data: { careerPitchingStatsCount: 0 } }),
    getcareerpitchingstats: (route) =>
      fulfillJson(route, { data: { careerPitchingStats: [] } }),
    getallplayerseasonstats: (route) => fulfillJson(route, BONDS_SEASON_STATS),
    getplayercareerarc: (route) => fulfillJson(route, BONDS_CAREER_ARC),
    careerarcquery: (route) => fulfillJson(route, BONDS_CAREER_ARC),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Stats — Row Click Opens Modal (LS-5595) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('clicking a player row opens the detail modal', async ({
    playersPage,
  }) => {
    await playersPage.stats.row(101).tap();

    await playersPage.detail.expectOpen();
  });

  test('modal shows the clicked player name', async ({ playersPage }) => {
    await playersPage.stats.row(101).tap();

    await playersPage.detail.expectOpen();
    await playersPage.detail.waitForPlayerName('Barry Bonds');
    await playersPage.detail.expectText('Barry Bonds');
  });

  test('URL gains playerId query param when modal opens', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.row(101).tap();

    await playersPage.detail.expectOpen();
    await expect(page).toHaveURL(/playerId=101/);
  });

  test('Close (×) button dismisses the modal', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.row(101).tap();
    await playersPage.detail.expectOpen();

    await playersPage.detail.close();

    await playersPage.detail.expectClosed();
    await expect(page).not.toHaveURL(/playerId/);
  });

  test('Escape key dismisses the modal', async ({ page, playersPage }) => {
    await playersPage.stats.row(101).tap();
    await playersPage.detail.expectOpen();

    await playersPage.detail.pressEscape();

    // Awaits the dialog's removal (deterministic web-first assertion), not a
    // fixed delay. The close itself is made reliable by the functional
    // setSearchParams fix in PlayerStatsRoute (LS-8260) — previously a stale
    // filter-commit closure could re-add ?playerId and resurrect the modal.
    await playersPage.detail.expectClosed();
    await expect(page).not.toHaveURL(/playerId/);
  });

  test('stats table is still visible after closing the modal', async ({
    playersPage,
  }) => {
    await playersPage.stats.row(101).tap();
    await playersPage.detail.expectOpen();

    await playersPage.detail.close();

    await playersPage.detail.expectClosed();
    await playersPage.stats.expectLoaded();
  });
});

test.describe('Player Stats — Modal open to free users (LS-10546) @regression', () => {
  test('free-tier user sees the detail modal from a ?playerId link', async ({
    page,
    playersPage,
  }) => {
    await createGraphQLRouter(page, {
      getuserbyid: (route) => fulfillJson(route, USER_BY_ID_FREE),
      // LS-9068: without this, `MyEntitlements` cascades to the _apiIsolation
      // baseline — which serves the PREMIUM catalog — so the "free" user would
      // be fully entitled and the test would not exercise the free path.
      myentitlements: (route) =>
        fulfillJson(route, tierEntitlementsResponse('free')),
      getcareerbattingstats: (route) =>
        fulfillJson(route, BATTING_STATS_RESPONSE),
      getcareerpitchingstatscount: (route) =>
        fulfillJson(route, { data: { careerPitchingStatsCount: 0 } }),
      getcareerpitchingstats: (route) =>
        fulfillJson(route, { data: { careerPitchingStats: [] } }),
      getallplayerseasonstats: (route) =>
        fulfillJson(route, BONDS_SEASON_STATS),
      getplayercareerarc: (route) => fulfillJson(route, BONDS_CAREER_ARC),
      careerarcquery: (route) => fulfillJson(route, BONDS_CAREER_ARC),
    });

    // Register BEFORE goto so the response can't be missed: the assertions
    // below must read the settled free-tier state, not the window before the
    // entitlement set resolves (LS-9068).
    const entitlementsResolved = page.waitForResponse(
      (resp) =>
        resp.url().includes('/graphql') &&
        (resp.request().postData() ?? '').includes('MyEntitlements'),
    );

    // Navigate directly with ?playerId=101 — exercises a shared deep link
    // without relying on a row click to set the URL param.
    await page.goto('/players/stats?playerId=101');
    await page.waitForLoadState('load');
    await playersPage.stats.expectLoaded();
    await entitlementsResolved;

    // The stats page itself is public (LS-9347) — no page-wide gate overlay
    // for a free viewer, and the table is visible…
    await expect(page.getByTestId('premium-feature-gate')).toHaveCount(0);
    await playersPage.stats.expectLoaded();

    // …and the modal mounts for the free viewer too: it is no longer gated
    // on the unrelated advanced_search_filters entitlement (LS-10546).
    await playersPage.detail.expectOpen();
  });
});
