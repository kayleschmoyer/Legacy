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

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

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
  startTime: START_TIME,
  endTime: END_TIME,
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
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
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
    },
  );
}

// ---------------------------------------------------------------------------
// Tests – Matchup Information card renders timestamps
// ---------------------------------------------------------------------------

test.describe('Matchup Information card – timestamps @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockMatchupGraphQL(page);
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('shows the Matchup Information heading', async ({ page }) => {
    await expect(page.getByText('Matchup Information')).toBeVisible();
  });

  test('shows the matchup start timestamp', async ({ page }) => {
    const startLine = page.getByText(/^Start:/);
    await expect(startLine).toBeVisible();
    // The component formats via Date#toLocaleString(); assert the fixture year
    // is present rather than an exact locale/timezone-dependent string.
    await expect(startLine).toContainText('2025');
  });

  test('shows the matchup end timestamp', async ({ page }) => {
    const endLine = page.getByText(/^End:/);
    await expect(endLine).toBeVisible();
    await expect(endLine).toContainText('2025');
  });
});

// ---------------------------------------------------------------------------
// Tests – card is hidden when the matchup has no timestamps
// ---------------------------------------------------------------------------

test.describe('Matchup Information card – hidden without timestamps @regression', () => {
  test('does not render the card when start and end times are null', async ({
    page,
  }) => {
    await mockMatchupGraphQL(page, { startTime: null, endTime: null });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    // The rest of the page still renders (main region present) but the
    // Matchup Information section is omitted.
    await expect(
      page.locator('[role="main"][aria-label="Matchup details"]'),
    ).toBeVisible();
    await expect(page.getByText('Matchup Information')).toHaveCount(0);
  });
});
