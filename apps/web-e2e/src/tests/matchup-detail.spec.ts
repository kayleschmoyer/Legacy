/**
 * Matchup Detail Page E2E Tests (LS-675)
 *
 * Covers /baseball/league/:leagueId/matchups/:matchupId:
 *   - Scoreboard, roster comparison, win probability panel
 *   - Week navigation controls
 *   - Loading / error / not-found states
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  spStartsPerMatchup: 2,
  selectedGamesCount: 4,
  startTime: null,
  endTime: null,
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

const MOCK_MATCHUPS_FOR_LEAGUE = [MOCK_MATCHUP];

async function mockMatchupGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('getmatchupbyid') ||
        postData.includes('matchupbyid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
        });
      } else if (
        postData.includes('getmatchupsforleague') ||
        postData.includes('matchupsforleague')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: MOCK_MATCHUPS_FOR_LEAGUE },
          }),
        });
      } else if (
        postData.includes('getcurrentweekforleague') ||
        postData.includes('currentweek')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (
        postData.includes('getuserteamid') ||
        postData.includes('userteamid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (
        postData.includes('getleagueteams') ||
        postData.includes('leagueteams')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests – page loading & structure
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – page structure @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockMatchupGraphQL(page);
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('loads the matchup detail page without errors', async ({ page }) => {
    await expect(page).toHaveURL(MATCHUP_URL);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows Matchup Details heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /matchup details/i }),
    ).toBeVisible();
  });

  test('shows Back to League button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /back to league/i }),
    ).toBeVisible();
  });

  test('clicking Back to League navigates back', async ({ page }) => {
    await page.getByRole('button', { name: /back to league/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(`/baseball/league/${LEAGUE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Tests – matchup content with mocked data
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – scoreboard @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockMatchupGraphQL(page);
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('does not show loading spinner after data loads', async ({ page }) => {
    await expect(
      page.getByText('Loading matchup details...'),
    ).not.toBeVisible();
  });

  test('does not show not-found state', async ({ page }) => {
    await expect(page.getByText('Matchup not found')).not.toBeVisible();
  });

  test('renders main matchup content area', async ({ page }) => {
    // The main content area has role="main" aria-label="Matchup details"
    await expect(
      page.locator('[role="main"][aria-label="Matchup details"]'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – loading state
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – loading state @regression', () => {
  test('shows loading spinner while data is pending', async ({ page }) => {
    // Intercept the matchup query with a long delay so the loading state
    // is reliably visible. Register this *before* the catch-all mock so
    // Playwright evaluates it first.
    let resolveMatchup: (() => void) | undefined;
    const matchupGate = new Promise<void>((r) => {
      resolveMatchup = r;
    });

    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';
        if (
          postData.includes('getmatchupbyid') ||
          postData.includes('matchupbyid')
        ) {
          // Hold the response until we've asserted the loading state
          await matchupGate;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
          });
        } else {
          await route.fallback();
        }
      },
    );

    // Catch-all for every other GraphQL operation
    await mockMatchupGraphQL(page);

    await page.goto(MATCHUP_URL, { waitUntil: 'commit' });

    await expect(page.getByText('Loading matchup details...')).toBeVisible();

    // Release the gate so the page can finish loading and cleanup
    resolveMatchup!();
  });
});

// ---------------------------------------------------------------------------
// Tests – error state
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – error state @regression', () => {
  test('shows error message when GraphQL returns an error', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('getmatchupbyid') ||
        postData.includes('matchupbyid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupById: null },
            errors: [{ message: 'Matchup not found' }],
          }),
        });
      } else {
        // Stub all other operations so the test isolates the error path
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    });

    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    // Either the error state or the not-found state should render
    const errorOrNotFound = page
      .getByText(/error loading matchup|matchup not found/i)
      .first();
    await expect(errorOrNotFound).toBeVisible();
  });
});
