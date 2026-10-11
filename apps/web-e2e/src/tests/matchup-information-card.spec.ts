/**
 * Matchup Information Card E2E Tests (LS-5352)
 *
 * Covers the "Matchup Information" section of
 * /baseball/league/:leagueId/matchups/:matchupId, which renders the matchup's
 * start and end timestamps. The section is rendered by MatchupDetailLayout and
 * only appears when the matchup has a non-null startTime or endTime — the
 * existing matchup-detail.spec.ts fixture leaves both null, so this spec is the
 * one that exercises the card.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8451 / ADR-0016): matchup assertions speak
// `matchupPage` driver verbs so the spec is selector-free and native-ready.
// `page` is retained only for GraphQL route mocking (a web-only capability).

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// Midday-UTC timestamps so the local-time formatting never rolls the calendar
// year across the timezones the browser might run in — keeps the year-based
// assertions below deterministic.
const START_TIME = '2025-06-15T18:30:00.000Z';
const END_TIME = '2025-06-22T18:30:00.000Z';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

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
  startTime: START_TIME as string | null,
  endTime: END_TIME as string | null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
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
    name: 'Beta Force',
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

/**
 * Route matchup GraphQL operations to fixtures. `matchupOverrides` lets a test
 * swap the matchup payload (e.g. to null out the timestamps) while reusing the
 * same catch-all wiring.
 */
async function mockMatchupGraphQL(
  page: import('@playwright/test').Page,
  matchupOverrides: Partial<typeof MOCK_MATCHUP> = {},
) {
  const matchup = { ...MOCK_MATCHUP, ...matchupOverrides };
  await page.route(isGraphQLEndpoint, async (route) => {
    // Match on the exact GraphQL operation name (not a substring of the raw
    // body) so a future operation whose name contains one of these as a
    // substring can't be silently intercepted.
    switch (extractOperationName(route)) {
      case 'GetMatchupById':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: matchup } }),
        });
        break;
      case 'GetMatchupsForLeague':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: [matchup] },
          }),
        });
        break;
      case 'GetCurrentWeekForLeague':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
        break;
      case 'GetUserTeamId':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
        break;
      case 'GetLeagueTeams':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
        break;
      default:
        await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests – Matchup Information card renders timestamps
// ---------------------------------------------------------------------------

test.describe('Matchup Information card – timestamps @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('shows the Matchup Information heading', async ({ matchupPage }) => {
    await matchupPage.text('Matchup Information').expectVisible();
  });

  test('shows the matchup start timestamp', async ({ matchupPage }) => {
    const startLine = matchupPage.text(/^Start:/);
    await startLine.expectVisible();
    // The component formats via Date#toLocaleString(); assert the fixture year
    // is present rather than an exact locale/timezone-dependent string.
    await startLine.expectContainsText('2025');
  });

  test('shows the matchup end timestamp', async ({ matchupPage }) => {
    const endLine = matchupPage.text(/^End:/);
    await endLine.expectVisible();
    await endLine.expectContainsText('2025');
  });
});

// ---------------------------------------------------------------------------
// Tests – card falls back gracefully on an invalid timestamp (LS-5886)
// ---------------------------------------------------------------------------

test.describe('Matchup Information card – invalid timestamps @regression', () => {
  test('shows a fallback instead of "Invalid Date" for a malformed start/end time', async ({
    page,
    matchupPage,
  }) => {
    await mockMatchupGraphQL(page, {
      startTime: 'not-a-real-timestamp',
      endTime: 'also-not-a-real-timestamp',
    });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);

    await matchupPage.text('Start: —').expectVisible();
    await matchupPage.text('End: —').expectVisible();
    await matchupPage.text('Invalid Date').expectCount(0);
  });
});

// ---------------------------------------------------------------------------
// Tests – card is hidden when the matchup has no timestamps
// ---------------------------------------------------------------------------

test.describe('Matchup Information card – hidden without timestamps @regression', () => {
  test('does not render the card when start and end times are null', async ({
    page,
    matchupPage,
  }) => {
    await mockMatchupGraphQL(page, { startTime: null, endTime: null });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);

    // The rest of the page still renders (main region present) but the
    // Matchup Information section is omitted.
    await matchupPage.mainRegion.expectVisible();
    await matchupPage.text('Matchup Information').expectCount(0);
  });
});
