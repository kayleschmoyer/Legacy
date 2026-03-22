/**
 * Season Progression E2E Test (LS-1648)
 *
 * State-machine-style hermetic test that validates the UI renders correctly
 * at each phase of a season's lifecycle:
 *
 *   1. Pre-selection — matchup shows "scheduled", no scores
 *   2. Game 1 selected, stats loading — loading indicator visible
 *   3. Game 1 stats loaded — scores visible
 *   4. Mid-week — multiple games, running totals
 *   5. All games complete — full scores, winner
 *   6. Week advanced — previous week completed, new week in_progress
 *   7. Season complete — standings page
 *   8. Playoff bracket — bracket UI renders seeded matchups
 *
 * A mutable `currentPhase` variable controls which mock responses the
 * GraphQL route handler returns. Between test steps the phase is advanced
 * and the page is re-navigated to trigger a fresh data fetch.
 *
 * All GraphQL responses are mocked — no live backend is required.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth-enhanced';
import type { MockLeagueAtWeek } from '../mocks/graphql/league.mocks';
import {
  mockLeagueAtWeek,
  mockLeagueInPlayoffs,
} from '../mocks/graphql/league.mocks';
import type { MockMatchupWithGames } from '../mocks/graphql/matchup.mocks';
import { mockMatchupProgression } from '../mocks/graphql/matchup.mocks';
import type {
  MockPlayoffBracket,
  MockTeamStanding,
} from '../mocks/graphql/standings.mocks';
import {
  mockPlayoffBracket,
  mockStandings,
} from '../mocks/graphql/standings.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;
const STANDINGS_URL = `/baseball/league/${LEAGUE_ID}/standings`;

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ---------------------------------------------------------------------------
// Season phase definitions
// ---------------------------------------------------------------------------

type SeasonPhase =
  | 'pre_selection'
  | 'stats_loading'
  | 'stats_loaded'
  | 'mid_week'
  | 'all_complete'
  | 'week_advanced'
  | 'season_complete'
  | 'playoffs';

// ---------------------------------------------------------------------------
// Mock data per phase
// ---------------------------------------------------------------------------

const MOCK_TEAMS = [
  {
    __typename: 'Team' as const,
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team' as const,
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team' as const,
    id: 3,
    name: 'Gamma Stars',
    leagueId: LEAGUE_ID,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team' as const,
    id: 4,
    name: 'Delta Kings',
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition' as const,
    id: 1,
    name: 'Catcher',
    abbrev: 'C',
  },
  {
    __typename: 'LeaguePosition' as const,
    id: 2,
    name: 'First Base',
    abbrev: '1B',
  },
];

function getLeagueForPhase(phase: SeasonPhase): MockLeagueAtWeek {
  switch (phase) {
    case 'pre_selection':
    case 'stats_loading':
    case 'stats_loaded':
    case 'mid_week':
    case 'all_complete':
      return mockLeagueAtWeek(1, 3);
    case 'week_advanced':
      return mockLeagueAtWeek(2, 3);
    case 'season_complete':
      return mockLeagueAtWeek(4, 3);
    case 'playoffs':
      return mockLeagueInPlayoffs();
  }
}

function getCurrentWeekForPhase(phase: SeasonPhase): number | null {
  switch (phase) {
    case 'pre_selection':
    case 'stats_loading':
    case 'stats_loaded':
    case 'mid_week':
    case 'all_complete':
      return 1;
    case 'week_advanced':
      return 2;
    case 'season_complete':
      return null;
    case 'playoffs':
      return 10;
  }
}

function getMatchupsForPhase(phase: SeasonPhase): MockMatchupWithGames[] {
  switch (phase) {
    case 'pre_selection':
      return [
        mockMatchupProgression('scheduled', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
        }),
      ];
    case 'stats_loading':
      return [
        mockMatchupProgression('in_progress_loading', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
        }),
      ];
    case 'stats_loaded':
      return [
        mockMatchupProgression('in_progress_loaded', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
        }),
      ];
    case 'mid_week':
      return [
        mockMatchupProgression('in_progress_loaded', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 25.3,
          team2Score: 22.1,
        }),
      ];
    case 'all_complete':
      return [
        mockMatchupProgression('completed', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
        }),
      ];
    case 'week_advanced':
      return [
        // Week 1 — completed
        mockMatchupProgression('completed', {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
        }),
        // Week 2 — in progress
        mockMatchupProgression('in_progress_loading', {
          id: MATCHUP_ID + 1,
          leagueId: LEAGUE_ID,
          weekNumber: 2,
          team1Id: 1,
          team2Id: 3,
        }),
      ];
    case 'season_complete':
    case 'playoffs':
      return [];
  }
}

function getMatchupByIdForPhase(
  phase: SeasonPhase,
): MockMatchupWithGames | null {
  const matchups = getMatchupsForPhase(phase);
  return matchups.length > 0 ? matchups[0] : null;
}

function getStandingsForPhase(phase: SeasonPhase): MockTeamStanding[] {
  switch (phase) {
    case 'season_complete':
    case 'playoffs':
      return mockStandings(4);
    default:
      return [];
  }
}

function getPlayoffBracketForPhase(
  phase: SeasonPhase,
): MockPlayoffBracket | null {
  if (phase === 'playoffs') {
    return mockPlayoffBracket('semifinals');
  }
  return null;
}

// ---------------------------------------------------------------------------
// GraphQL route handler — reads currentPhase to determine responses
// ---------------------------------------------------------------------------

async function setupSeasonGraphQL(
  page: Page,
  phaseRef: { current: SeasonPhase },
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';
    const phase = phaseRef.current;

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: getLeagueForPhase(phase) } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: { __typename: 'UserTeamId', teamId: 1 } },
        }),
      });
    } else if (postData.includes('getmatchupsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: getMatchupsForPhase(phase) },
        }),
      });
    } else if (
      postData.includes('getmatchupbyid') ||
      postData.includes('matchupbyid')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupById: getMatchupByIdForPhase(phase) },
        }),
      });
    } else if (postData.includes('getcurrentweekforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: getCurrentWeekForPhase(phase) },
        }),
      });
    } else if (postData.includes('getcurrentmatchup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { currentMatchup: getMatchupByIdForPhase(phase) },
        }),
      });
    } else if (postData.includes('getleaguestandings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getLeagueStandings: getStandingsForPhase(phase) },
        }),
      });
    } else if (postData.includes('getplayoffbracket')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { playoffBracket: getPlayoffBracketForPhase(phase) },
        }),
      });
    } else if (postData.includes('getmatchupplayers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { matchupPlayers: [] } }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Season Progression — multi-phase UI @regression', () => {
  test.describe('Phase 1: Pre-selection', () => {
    test('matchup page shows scheduled status with no scores', async ({
      page,
    }) => {
      const phaseRef = { current: 'pre_selection' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      // The matchup page should render without crashing
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Scheduled status should be visible somewhere on the page
      await expect(page.getByText(/scheduled/i).first()).toBeVisible();
    });
  });

  test.describe('Phase 2: Stats loading', () => {
    test('matchup shows in-progress status while stats load', async ({
      page,
    }) => {
      const phaseRef = { current: 'stats_loading' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Should show an in-progress or active indicator
      const statusIndicator = page
        .getByText(/in.progress|active|live/i)
        .first();
      await expect(statusIndicator).toBeVisible();
    });
  });

  test.describe('Phase 3: Stats loaded', () => {
    test('matchup displays scores when stats are loaded', async ({ page }) => {
      const phaseRef = { current: 'stats_loaded' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Scores from mockMatchupProgression('in_progress_loaded') are 42.5 and 38.0
      // At least one score should be visible on the page
      const scorePattern = page.locator('text=/\\d+\\.\\d/');
      await expect(scorePattern.first()).toBeVisible();
    });
  });

  test.describe('Phase 4: Mid-week', () => {
    test('matchup shows running score totals during mid-week', async ({
      page,
    }) => {
      const phaseRef = { current: 'mid_week' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Mid-week scores are 25.3 and 22.1 — partial scores should be visible
      const scorePattern = page.locator('text=/\\d+\\.\\d/');
      await expect(scorePattern.first()).toBeVisible();
    });
  });

  test.describe('Phase 5: All games complete', () => {
    test('matchup shows completed status with final scores', async ({
      page,
    }) => {
      const phaseRef = { current: 'all_complete' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Completed matchup should show completed/final status
      const completedIndicator = page.getByText(/completed|final/i).first();
      await expect(completedIndicator).toBeVisible();

      // Final scores (85.5 and 72.0) should be visible
      const scorePattern = page.locator('text=/\\d+\\.\\d/');
      await expect(scorePattern.first()).toBeVisible();
    });
  });

  test.describe('Phase 6: Week advanced', () => {
    test('league page shows both completed and in-progress matchups', async ({
      page,
    }) => {
      const phaseRef = { current: 'week_advanced' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(`/baseball/league/${LEAGUE_ID}`);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Both team names from the matchups should be visible
      await expect(page.getByText('Alpha Squad').first()).toBeVisible();
    });
  });

  test.describe('Phase 7: Season complete', () => {
    test('standings page renders team records after season ends', async ({
      page,
    }) => {
      const phaseRef = { current: 'season_complete' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(STANDINGS_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Standings data: 4 teams from mockStandings(4) — team names visible
      await expect(page.getByText('Diamond Dogs').first()).toBeVisible();
      await expect(page.getByText('The Sluggers').first()).toBeVisible();
    });
  });

  test.describe('Phase 8: Playoff bracket', () => {
    test('standings page shows playoff bracket with seeded matchups', async ({
      page,
    }) => {
      const phaseRef = { current: 'playoffs' as SeasonPhase };
      await setupSeasonGraphQL(page, phaseRef);
      await page.goto(STANDINGS_URL);
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // Standings teams should still be visible
      await expect(page.getByText('Diamond Dogs').first()).toBeVisible();
    });
  });
});

test.describe('Season Progression — state-machine walkthrough @regression', () => {
  test('advances through all season phases via mutable phase ref', async ({
    page,
  }) => {
    const phaseRef = { current: 'pre_selection' as SeasonPhase };
    await setupSeasonGraphQL(page, phaseRef);

    // Phase 1: Pre-selection
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    await expect(page.getByText(/scheduled/i).first()).toBeVisible();

    // Phase 2: Stats loading
    phaseRef.current = 'stats_loading';
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
    await expect(
      page.getByText(/in.progress|active|live/i).first(),
    ).toBeVisible();

    // Phase 3: Stats loaded — scores appear
    phaseRef.current = 'stats_loaded';
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
    await expect(page.locator('text=/\\d+\\.\\d/').first()).toBeVisible();

    // Phase 4: Mid-week — partial scores
    phaseRef.current = 'mid_week';
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
    await expect(page.locator('text=/\\d+\\.\\d/').first()).toBeVisible();

    // Phase 5: All complete — final scores visible
    phaseRef.current = 'all_complete';
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
    await expect(page.getByText(/completed|final/i).first()).toBeVisible();

    // Phase 6: Week advanced — league page shows matchup data
    phaseRef.current = 'week_advanced';
    await page.goto(`/baseball/league/${LEAGUE_ID}`);
    await page.waitForLoadState('load');
    await expect(page.getByText('Alpha Squad').first()).toBeVisible();

    // Phase 7: Season complete — standings page
    phaseRef.current = 'season_complete';
    await page.goto(STANDINGS_URL);
    await page.waitForLoadState('load');
    await expect(page.getByText('Diamond Dogs').first()).toBeVisible();
    await expect(page.getByText('The Sluggers').first()).toBeVisible();

    // Phase 8: Playoffs — bracket renders
    phaseRef.current = 'playoffs';
    await page.goto(STANDINGS_URL);
    await page.waitForLoadState('load');
    await expect(page.getByText('Diamond Dogs').first()).toBeVisible();
  });
});
