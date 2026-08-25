/**
 * E2E Tests: Player Detail Deep-Link Origins @critical (LS-6974)
 *
 * Covers the 5 entry-point surfaces that can navigate to or display player
 * detail, verifying URL transitions, dialog visibility, and back-navigation
 * behaviour at both desktop and mobile (390×844) viewports.
 *
 * Surface inventory:
 *  1. Roster tab         — click player slot → /players/:id route → back → roster
 *  2. Player Stats       — click player row  → /players/:id route → back → stats
 *  3. Matchup detail     — click player name → PlayerSeasonStatsModal (inline dialog)
 *  4. Free Agents tab    — no player-detail navigation; smoke-loads only
 *  5. Draft board        — stub PlayerDetailModal (returns null); smoke-loads only
 *
 * AC1: URL and dialog visibility verified per origin.
 * AC2: Back navigation resolves to the originating surface.
 * AC3: Both desktop and mobile viewports exercised.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const ROSTER_URL = `/baseball/league/${LEAGUE_ID}/roster`;
const FREE_AGENTS_URL = `/baseball/league/${LEAGUE_ID}/free-agents`;
const DRAFT_URL = `/baseball/league/${LEAGUE_ID}/draft`;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// ── Mock data: roster ─────────────────────────────────────────────────────────

// Custom positions so positionId 1 maps to SP (matching the team member below).
const ROSTER_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: 1,
    leagueId: LEAGUE_ID,
    positionType: 'SP',
  },
  {
    __typename: 'LeaguePosition',
    id: 2,
    leagueId: LEAGUE_ID,
    positionType: '1B',
  },
  {
    __typename: 'LeaguePosition',
    id: 3,
    leagueId: LEAGUE_ID,
    positionType: 'CF',
  },
];

const ROSTER_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 101,
    playerId: 501,
    positionId: 1, // SP slot
    teamId: 1,
    leagueId: LEAGUE_ID,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 501,
      firstName: 'Gerrit',
      lastName: 'Cole',
      brefId: 'colege01',
      eligiblePositions: ['SP'],
      seasonsPlayed: 10,
      careerBatting: null,
    },
  },
];

// ── Mock data: player detail stats (pitcher) ──────────────────────────────────

const PITCHER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP'],
      firstName: 'Gerrit',
      lastName: 'Cole',
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2024,
        team: 'NYY',
        games: 33,
        wins: 17,
        losses: 4,
        gamesStarted: 33,
        completeGames: 1,
        shutouts: 0,
        saves: 0,
        inningsPitched: 213,
        hits: 165,
        runs: 60,
        earnedRuns: 56,
        homeRuns: 15,
        baseOnBalls: 42,
        strikeouts: 222,
        earnedRunAverage: '2.36',
        whip: 0.97,
      },
    ],
    playerSeasonFielding: [],
  },
};

const CAREER_ARC_EMPTY = {
  data: { player: null, playerSeasonBatting: [], playerSeasonPitching: [] },
};

// ── Mock data: player stats page (batter career grid) ────────────────────────

const BATTER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['CF', 'OF'],
      firstName: 'Mike',
      lastName: 'Trout',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAA',
        games: 145,
        plateAppearances: 620,
        atBats: 550,
        runs: 95,
        hits: 165,
        doubles: 30,
        triples: 2,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        caughtStealing: 3,
        baseOnBalls: 60,
        strikeouts: 110,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

// Career batting stats connection — drives the /players/stats data grid rows.
// Player id: 1 → renders data-testid="player-row-1".
const CAREER_BATTING_STATS_RESPONSE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 1,
      edges: [
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 1,
            primaryPosition: 'CF',
            positionsPlayed: null,
            games: 1131,
            plateAppearances: 5101,
            atBats: 4289,
            runs: 894,
            hits: 1559,
            doubles: 315,
            triples: 48,
            homeRuns: 368,
            rbi: 817,
            stolenBases: 211,
            caughtStealing: 57,
            baseOnBalls: 774,
            strikeouts: 1034,
            totalBases: 2988,
            groundedIntoDoublePlays: 76,
            hitByPitch: 35,
            sacrificeHits: 3,
            intentionalBaseOnBalls: 231,
            battingAverage: 0.304,
            onBasePercentage: 0.41,
            sluggingPercentage: 0.582,
            offensiveWAR: 72.9,
            player: {
              __typename: 'Player',
              id: 1,
              firstName: 'Mike',
              lastName: 'Trout',
              brefId: 'troutmi01',
            },
          },
        },
      ],
      pageInfo: {
        __typename: 'PageInfo',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    },
  },
};

// ── Mock data: matchup ────────────────────────────────────────────────────────

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 3,
  team1Id: 1,
  team2Id: 2,
  team1Score: 42.5,
  team2Score: 38.1,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 4,
  startTime: null,
  endTime: null,
};

// positionId: 9 matches the baseline leaguePositionsResponse (id 9 = SP).
const MOCK_MATCHUP_PLAYERS = [
  {
    __typename: 'MatchupPlayer',
    id: 1,
    playerId: 501,
    teamId: 1,
    positionId: 9,
    matchupId: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    season: 2024,
    games: [],
    numberOfGames: 0,
    player: {
      __typename: 'Player',
      id: 501,
      firstName: 'Gerrit',
      lastName: 'Cole',
      eligiblePositions: ['SP'],
    },
  },
  {
    __typename: 'MatchupPlayer',
    id: 2,
    playerId: 502,
    teamId: 2,
    positionId: 2,
    matchupId: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    season: 2024,
    games: [],
    numberOfGames: 0,
    player: {
      __typename: 'Player',
      id: 502,
      firstName: 'Freddie',
      lastName: 'Freeman',
      eligiblePositions: ['1B'],
    },
  },
];

// ── Route helpers ─────────────────────────────────────────────────────────────

async function mockRosterWithPlayerDetail(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetTeamMembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: ROSTER_TEAM_MEMBERS } }),
      });
    } else if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: ROSTER_POSITIONS } }),
      });
    } else if (op === 'GetAllPlayerSeasonStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PITCHER_SEASON_STATS),
      });
    } else if (op === 'GetPlayerCareerArc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_ARC_EMPTY),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

async function mockStatsWithPlayerDetail(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetCareerBattingStats' || op === 'GetPlayersWithStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_BATTING_STATS_RESPONSE),
      });
    } else if (op === 'GetAllPlayerSeasonStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(BATTER_SEASON_STATS),
      });
    } else if (op === 'GetPlayerCareerArc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_ARC_EMPTY),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

async function mockMatchupWithPlayerDetail(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [MOCK_MATCHUP] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
      });
    } else if (op === 'GetMatchupPlayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupPlayers: MOCK_MATCHUP_PLAYERS },
        }),
      });
    } else if (op === 'GetAllPlayerSeasonStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PITCHER_SEASON_STATS),
      });
    } else if (op === 'GetPlayerCareerArc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_ARC_EMPTY),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('Player Detail Deep-Link Origins @critical', () => {
  // ── 1. Roster origin ───────────────────────────────────────────────────────
  // RosterTab.tsx calls navigate('/players/:id') via React Router so
  // location.key is set — the back button correctly returns to the roster URL.

  test.describe('Roster origin @critical', () => {
    test('desktop: click player slot opens /players/:id dialog', async ({
      page,
    }) => {
      await mockRosterWithPlayerDetail(page);
      await page.goto(ROSTER_URL);
      await page.waitForLoadState('load');

      // The chevron button (aria-label "View <Name> detail") is the navigation
      // trigger; clicking the outer slot row selects the player for swap/assign.
      await page
        .getByRole('button', { name: /view gerrit cole detail/i })
        .click();
      await page.waitForURL('**/players/501');
      await expect(page.locator('div[role="dialog"]')).toBeVisible();
    });

    test('desktop: back button returns to roster URL', async ({ page }) => {
      await mockRosterWithPlayerDetail(page);
      await page.goto(ROSTER_URL);
      await page.waitForLoadState('load');

      await page
        .getByRole('button', { name: /view gerrit cole detail/i })
        .click();
      await page.waitForURL('**/players/501');
      await expect(page.locator('div[role="dialog"]')).toBeVisible();

      // Click the in-masthead "← Back" button. The standalone /players/:id
      // route renders TWO "← Back" affordances: the page-level `.player-back-btn`
      // (PlayerStatsPage) and the in-modal one (PlayerDetailModal). The page-level
      // button sits UNDER the modal overlay, so a page-wide `.first()` match
      // resolves it and any real click is (correctly) intercepted by the overlay
      // — the reason this used to need `dispatchEvent('click')`. Scoping to the
      // dialog targets the reachable in-modal button instead (LS-5578 / LS-8311),
      // matching PlayerDetailSurface.back().
      await page
        .locator('div[role="dialog"]')
        .getByRole('button', { name: /← back/i })
        .click();
      await page.waitForURL(ROSTER_URL);
    });

    test('mobile: click player slot opens /players/:id dialog', async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockRosterWithPlayerDetail(page);
      await page.goto(ROSTER_URL);
      await page.waitForLoadState('load');

      await page
        .getByRole('button', { name: /view gerrit cole detail/i })
        .click();
      await page.waitForURL('**/players/501');
      await expect(page.locator('div[role="dialog"]')).toBeVisible();
    });

    test('mobile: back button returns to roster URL', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockRosterWithPlayerDetail(page);
      await page.goto(ROSTER_URL);
      await page.waitForLoadState('load');

      await page
        .getByRole('button', { name: /view gerrit cole detail/i })
        .click();
      await page.waitForURL('**/players/501');
      await expect(page.locator('div[role="dialog"]')).toBeVisible();

      // Scope to the dialog so the reachable in-modal "← Back" is clicked, not
      // the page-level `.player-back-btn` that sits under the overlay (see the
      // desktop case above for the full rationale).
      await page
        .locator('div[role="dialog"]')
        .getByRole('button', { name: /← back/i })
        .click();
      await page.waitForURL(ROSTER_URL);
    });
  });

  // ── 2. Player Stats / Search origin ───────────────────────────────────────
  // PlayerStatsPage rows call navigate('/players/:id') via React Router so
  // location.key is set — the back button correctly returns to /players
  // (LS-9076 — the canonical stats route, formerly /players/stats).

  /**
   * The `desktop:` cases here drive `player-row-N`, a desktop data-grid row that
   * `PlayersCardFeed` has no equivalent for below `media.sm` (LS-9075). Pinned
   * rather than skipped. The `mobile:` cases in this same describe call
   * `page.setViewportSize(MOBILE_VIEWPORT)` themselves, so they override this
   * pin per-test and keep exercising the card feed (LS-9712).
   */
  test.describe('Stats/Search origin @critical', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('desktop: click player row opens /players/:id dialog', async ({
      page,
      playersPage,
    }) => {
      await mockStatsWithPlayerDetail(page);
      await playersPage.gotoStats();

      // Wait for the data grid row to appear (player id 1 → data-testid="player-row-1")
      await playersPage.stats.row(1).expectVisible({ timeout: 15_000 });
      await playersPage.stats.row(1).tap();

      // Numeric player IDs open an in-place modal via ?playerId= (PST-051 / LS-7124)
      await page.waitForURL(/\/players\?.*playerId=1/);
      await playersPage.detail.expectOpen();
    });

    test('desktop: back button returns to /players', async ({
      page,
      playersPage,
    }) => {
      await mockStatsWithPlayerDetail(page);
      await playersPage.gotoStats();

      await playersPage.stats.row(1).expectVisible({ timeout: 15_000 });
      await playersPage.stats.row(1).tap();
      await page.waitForURL(/\/players\?.*playerId=1/);
      await playersPage.detail.expectOpen();

      // PST-051: close the in-place modal via its X button; handleClosePlayerDetails
      // strips ?playerId= via replaceState (other filter params are preserved).
      // waitForFunction (not waitForURL) because replaceState fires no navigation event.
      await playersPage.detail.close();
      await page.waitForFunction(
        () => !new URLSearchParams(window.location.search).has('playerId'),
        null,
        { timeout: 10_000 },
      );
      await playersPage.detail.expectClosed();
    });

    test('mobile: click player row opens /players/:id dialog', async ({
      page,
      playersPage,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockStatsWithPlayerDetail(page);
      await playersPage.gotoStats();

      // Phone-width /players/stats renders the card feed, not the table
      // (LS-9075) — the row-by-testid selector below only exists in the
      // desktop table, so a mobile-viewport test must open the player via
      // the card's visible name instead of `stats.row(id)`.
      await playersPage.stats.expectCardFeedVisible('mlb');
      await playersPage.stats.openPlayerByName('Mike Trout');

      // Numeric player IDs open an in-place modal via ?playerId= (PST-051 / LS-7124)
      await page.waitForURL(/\/players\?.*playerId=1/);
      await playersPage.detail.expectOpen();
    });

    test('mobile: back button returns to /players', async ({
      page,
      playersPage,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockStatsWithPlayerDetail(page);
      await playersPage.gotoStats();

      await playersPage.stats.expectCardFeedVisible('mlb');
      await playersPage.stats.openPlayerByName('Mike Trout');
      await page.waitForURL(/\/players\?.*playerId=1/);
      await playersPage.detail.expectOpen();

      // PST-051: close the in-place modal via its X button; handleClosePlayerDetails
      // strips ?playerId= via replaceState (other filter params are preserved).
      // waitForFunction (not waitForURL) because replaceState fires no navigation event.
      await playersPage.detail.close();
      await page.waitForFunction(
        () => !new URLSearchParams(window.location.search).has('playerId'),
        null,
        { timeout: 10_000 },
      );
      await playersPage.detail.expectClosed();
    });
  });

  // ── 3. Matchup origin ─────────────────────────────────────────────────────
  // MatchupRosterComparison opens PlayerSeasonStatsModal (an inline dialog, not
  // a /players/:id route) when a player name is clicked. Closing the dialog
  // keeps the user on the matchup URL — no history entry is pushed.

  test.describe('Matchup origin @critical', () => {
    test('desktop: clicking a player name opens the season stats dialog', async ({
      page,
    }) => {
      await mockMatchupWithPlayerDetail(page);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      // Wait for the roster comparison to render the player's name
      await expect(page.getByText('Gerrit Cole').first()).toBeVisible({
        timeout: 15_000,
      });
      // force: true — matchup table stat-overlay cells intercept pointer events on the text node
      await page.getByText('Gerrit Cole').first().click({ force: true });

      await expect(page.locator('div[role="dialog"]')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('desktop: closing the player dialog stays on matchup URL', async ({
      page,
    }) => {
      await mockMatchupWithPlayerDetail(page);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.getByText('Gerrit Cole').first()).toBeVisible({
        timeout: 15_000,
      });
      // force: true — matchup table stat-overlay cells intercept pointer events on the text node
      await page.getByText('Gerrit Cole').first().click({ force: true });

      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      await dialog
        .getByRole('button', { name: /close/i })
        .first()
        // force: true — the open matchup page may layer elements over the dialog's close button
        .click({ force: true });
      await expect(dialog).not.toBeVisible();
      await expect(page).toHaveURL(MATCHUP_URL);
    });

    test('mobile: clicking a player name opens the season stats dialog', async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockMatchupWithPlayerDetail(page);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.getByText('Gerrit Cole').first()).toBeVisible({
        timeout: 15_000,
      });
      // force: true — matchup table stat-overlay cells intercept pointer events on the text node
      await page.getByText('Gerrit Cole').first().click({ force: true });

      await expect(page.locator('div[role="dialog"]')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('mobile: closing the player dialog stays on matchup URL', async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockMatchupWithPlayerDetail(page);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.getByText('Gerrit Cole').first()).toBeVisible({
        timeout: 15_000,
      });
      // force: true — matchup table stat-overlay cells intercept pointer events on the text node
      await page.getByText('Gerrit Cole').first().click({ force: true });

      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      await dialog
        .getByRole('button', { name: /close/i })
        .first()
        // force: true — the open matchup page may layer elements over the dialog's close button
        .click({ force: true });
      await expect(dialog).not.toBeVisible();
      await expect(page).toHaveURL(MATCHUP_URL);
    });
  });

  // ── 4. Free Agents origin — smoke ─────────────────────────────────────────
  // LeagueDetailFreeAgentsTab renders player names as plain Text with no
  // onPress — there is no navigation to /players/:id from this surface.
  // The claim button opens WaiverClaimModal (unrelated to player detail).
  // These tests confirm the surface loads without errors.

  test.describe('Free Agents origin', () => {
    test('desktop: surface loads without errors', async ({ page }) => {
      await page.goto(FREE_AGENTS_URL);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(FREE_AGENTS_URL);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('mobile: surface loads without errors', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto(FREE_AGENTS_URL);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(FREE_AGENTS_URL);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // ── 5. Draft origin — smoke ───────────────────────────────────────────────
  // DraftPlayerBoard.tsx contains a no-op PlayerDetailModal stub that returns
  // null — there is no navigation to /players/:id from the draft board.
  // These tests confirm the surface loads without errors.

  test.describe('Draft origin', () => {
    test('desktop: surface loads without errors', async ({ page }) => {
      await page.goto(DRAFT_URL);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(DRAFT_URL);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('mobile: surface loads without errors', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto(DRAFT_URL);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(DRAFT_URL);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });
});
