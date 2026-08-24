/**
 * Football Matchup Detail — Upcoming / Live / Final States E2E Tests (LS-5427)
 *
 * Covers /football/league/:leagueId/matchups/:matchupId — the shared
 * MatchupDetailPage component's per-status rendering for a football league:
 *   - Scheduled ("Upcoming"): SCHEDULED badge, Win Probability panel with
 *     projections, no AI Matchup Recap panel.
 *   - InProgress ("Live"): LIVE badge, scores visible, Win Probability panel
 *     still shown while games remain.
 *   - Completed ("Final"): FINAL badge, server-stored scores, Win Probability
 *     panel unmounted entirely, AI Matchup Recap panel shown instead.
 *
 * Bye-week is explicitly out of scope (see LS-5427 ticket "Out of Scope") —
 * it is not implemented anywhere on this page; a bye week has no matchupId to
 * route into this page with in the first place. Loading/error/not-found
 * states are LS-5356's territory (baseball-matchup-detail) and are not
 * duplicated here.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const SCHEDULED_MATCHUP_ID = 61;
const IN_PROGRESS_MATCHUP_ID = 62;
const COMPLETED_MATCHUP_ID = 63;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Gridiron Giants',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'End Zone Eagles',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

function makeMatchup(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Matchup',
    id: SCHEDULED_MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 6,
    team1Id: 1,
    team2Id: 2,
    team1Score: 0,
    team2Score: 0,
    status: 'scheduled',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 0,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

const SCHEDULED_MATCHUP = makeMatchup();

const IN_PROGRESS_MATCHUP = makeMatchup({
  id: IN_PROGRESS_MATCHUP_ID,
  status: 'in_progress',
  team1Score: 24.6,
  team2Score: 19.3,
  selectedGamesCount: 0,
});

const COMPLETED_MATCHUP = makeMatchup({
  id: COMPLETED_MATCHUP_ID,
  status: 'completed',
  team1Score: 31.4,
  team2Score: 27.8,
  selectedGamesCount: 1,
});

const MOCK_WIN_PROBABILITY = {
  __typename: 'MatchupWinProbability',
  team1WinProbability: 0.57,
  team2WinProbability: 0.43,
  tiesProbability: 0,
  team1ProjectedScore: 105.2,
  team2ProjectedScore: 96.8,
  simulationCount: 5000,
};

const MOCK_RECAP = {
  __typename: 'MatchupRecap',
  headline: 'Gridiron Giants hold off End Zone Eagles in a shootout',
  narrative:
    'A high-scoring affair that came down to the final drive, with the Giants defense sealing the win.',
  highlights: ['Giants closed the week on a hot streak.'],
  matchupType: 'close',
  winnerId: 1,
};

// ---------------------------------------------------------------------------
// GraphQL mock setup
// ---------------------------------------------------------------------------

/**
 * Routes every GraphQL operation the football matchup detail page issues for
 * a single `currentMatchup` fixture. `withWinProbability` controls whether
 * `GetMatchupWinProbability` returns a populated projection (Scheduled /
 * InProgress) or `null` (Completed — the panel unmounts before the query
 * result would even matter, but mocking `null` keeps the fixture honest).
 * `MatchupScores` / `GetTeamMatchupHistory` / `GetLeagueStandings` back the
 * football-only "Additional Sections" area (LS-5424), which always renders
 * on this route regardless of status — empty arrays keep it out of the way
 * of these status-matrix assertions.
 */
async function mockFootballMatchupStatesGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    currentMatchup: Record<string, unknown>;
    withWinProbability: boolean;
  },
) {
  const { currentMatchup, withWinProbability } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: currentMatchup } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [currentMatchup] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: currentMatchup.weekNumber },
        }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'GetMatchupPlayers') {
      // A GraphQL error (not an empty-but-successful `[]`) — MatchupScoreboard's
      // computeMatchupScores() only falls back to the matchup's server-stored
      // team1Score/team2Score when the players query errors or returns
      // null/undefined; a successful empty array is treated as "zero players,
      // zero live score" and sums to 0, which doesn't match this file's fixture
      // scores. This spec has no per-player roster fixtures to compute a live
      // score from, so it intentionally exercises the fallback path — the one
      // that actually renders `currentMatchup.team1Score`/`team2Score` (LS-9712:
      // found while driving an unrelated PR to green — this was flaking
      // Mobile-Chrome-only under CI's live-DOM timing, though the bug applies
      // to any viewport).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'getMatchupPlayers not mocked for this spec' }],
          data: null,
        }),
      });
    } else if (op === 'GetMatchupWinProbability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupById: {
              __typename: 'Matchup',
              id: currentMatchup.id,
              winProbability: withWinProbability ? MOCK_WIN_PROBABILITY : null,
            },
          },
        }),
      });
    } else if (op === 'GetMatchupRecap') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupById: { ...currentMatchup, recap: MOCK_RECAP } },
        }),
      });
    } else if (op === 'MatchupScores') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { matchupScores: [] } }),
      });
    } else if (op === 'GetTeamMatchupHistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
      });
    } else if (op === 'GetLeagueStandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests — Scheduled ("Upcoming")
// ---------------------------------------------------------------------------

test.describe('Football Matchup States – scheduled (upcoming) @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: SCHEDULED_MATCHUP,
      withWinProbability: true,
    });
    await matchupPage.goto(LEAGUE_ID, SCHEDULED_MATCHUP_ID, 'football');
  });

  test('renders the SCHEDULED status badge', async ({ matchupPage }) => {
    await matchupPage.expectNoAppError();
    await matchupPage.text('SCHEDULED', { exact: true }).expectVisible();
  });

  test('shows the Win Probability panel with projected scores', async ({
    matchupPage,
  }) => {
    const panel = matchupPage.winProbabilityPanel;
    await panel.expectVisible({ timeout: 10000 });
    await panel.byText('PROJECTED FINAL SCORES').expectVisible();
  });

  test('does not show the AI Matchup Recap panel', async ({ matchupPage }) => {
    await matchupPage
      .text(/gridiron giants hold off end zone eagles/i)
      .expectHidden();
  });
});

// ---------------------------------------------------------------------------
// Tests — InProgress ("Live")
// ---------------------------------------------------------------------------

test.describe('Football Matchup States – in progress (live) @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: IN_PROGRESS_MATCHUP,
      withWinProbability: true,
    });
    await matchupPage.goto(LEAGUE_ID, IN_PROGRESS_MATCHUP_ID, 'football');
  });

  test('renders the LIVE status badge', async ({ matchupPage }) => {
    await matchupPage.expectNoAppError();
    await matchupPage.text('LIVE', { exact: true }).expectVisible();
  });

  test('shows the current score for both teams', async ({ matchupPage }) => {
    await matchupPage.text('24.60', { exact: false }).expectVisible();
    await matchupPage.text('19.30', { exact: false }).expectVisible();
  });

  test('still shows the Win Probability panel while games remain', async ({
    matchupPage,
  }) => {
    const panel = matchupPage.winProbabilityPanel;
    await panel.expectVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — Completed ("Final")
// ---------------------------------------------------------------------------

test.describe('Football Matchup States – completed (final) @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: COMPLETED_MATCHUP,
      withWinProbability: false,
    });
    await matchupPage.goto(LEAGUE_ID, COMPLETED_MATCHUP_ID, 'football');
  });

  test('renders the FINAL status badge', async ({ matchupPage }) => {
    await matchupPage.expectNoAppError();
    await matchupPage.text('FINAL', { exact: true }).expectVisible();
  });

  test('shows the server-stored final scores', async ({ matchupPage }) => {
    await matchupPage.text('31.40', { exact: false }).expectVisible();
    await matchupPage.text('27.80', { exact: false }).expectVisible();
  });

  test('does not render the Win Probability panel', async ({ matchupPage }) => {
    await matchupPage.winProbabilityPanel.expectHidden();
  });

  test('shows the AI Matchup Recap panel instead', async ({ matchupPage }) => {
    await matchupPage
      .text(/gridiron giants hold off end zone eagles/i)
      .expectVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — mobile-web (narrow viewport)
//
// This repo's convention (see league-standings-tab.spec.ts) is that
// mobile-web coverage rides the same hermetic Playwright spec as web, at a
// narrow viewport, rather than a separate suite.
// ---------------------------------------------------------------------------

test.describe('Football Matchup States – mobile-web @regression', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('shows the SCHEDULED badge at mobile width', async ({
    page,
    matchupPage,
  }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: SCHEDULED_MATCHUP,
      withWinProbability: true,
    });
    await matchupPage.goto(LEAGUE_ID, SCHEDULED_MATCHUP_ID, 'football');
    await matchupPage.text('SCHEDULED', { exact: true }).expectVisible();
  });

  test('shows the LIVE badge at mobile width', async ({
    page,
    matchupPage,
  }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: IN_PROGRESS_MATCHUP,
      withWinProbability: true,
    });
    await matchupPage.goto(LEAGUE_ID, IN_PROGRESS_MATCHUP_ID, 'football');
    await matchupPage.text('LIVE', { exact: true }).expectVisible();
  });

  test('shows the FINAL badge at mobile width', async ({
    page,
    matchupPage,
  }) => {
    await mockFootballMatchupStatesGraphQL(page, {
      currentMatchup: COMPLETED_MATCHUP,
      withWinProbability: false,
    });
    await matchupPage.goto(LEAGUE_ID, COMPLETED_MATCHUP_ID, 'football');
    await matchupPage.text('FINAL', { exact: true }).expectVisible();
  });
});
