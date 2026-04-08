/**
 * Matchup Week Navigation & Win Probability E2E Tests (LS-1626)
 *
 * Covers /baseball/league/:leagueId/matchups/:matchupId:
 *   - Current week display with scores
 *   - Week navigation (prev / next) stepper controls
 *   - Win probability panel visibility for premium vs free users
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID_WEEK3 = 30;
const MATCHUP_ID_WEEK4 = 40;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID_WEEK3}`;

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
  {
    __typename: 'Team',
    id: 3,
    name: 'Gamma Rays',
    leagueId: LEAGUE_ID,
    waiverOrder: 3,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 3,
  },
  {
    __typename: 'Team',
    id: 4,
    name: 'Delta Hawks',
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 4,
  },
];

function makeMatchup(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Matchup',
    id: String(MATCHUP_ID_WEEK3),
    leagueId: LEAGUE_ID,
    weekNumber: 3,
    team1Id: 1,
    team2Id: 2,
    team1Score: 42.5,
    team2Score: 38.1,
    status: 'IN_PROGRESS',
    statsLoadingStatus: 'COMPLETE',
    gamesPerMatchup: 7,
    spStartsPerMatchup: 2,
    selectedGamesCount: 4,
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

const WEEK3_MATCHUP = makeMatchup();

const WEEK3_MATCHUP_B = makeMatchup({
  id: String(MATCHUP_ID_WEEK3 + 1),
  team1Id: 3,
  team2Id: 4,
  team1Score: 35.2,
  team2Score: 41.0,
});

const WEEK4_MATCHUP = makeMatchup({
  id: String(MATCHUP_ID_WEEK4),
  weekNumber: 4,
  team1Id: 1,
  team2Id: 3,
  team1Score: 20.0,
  team2Score: 18.5,
});

const WEEK4_MATCHUP_B = makeMatchup({
  id: String(MATCHUP_ID_WEEK4 + 1),
  weekNumber: 4,
  team1Id: 2,
  team2Id: 4,
  team1Score: 22.3,
  team2Score: 25.7,
});

const ALL_MATCHUPS = [
  WEEK3_MATCHUP,
  WEEK3_MATCHUP_B,
  WEEK4_MATCHUP,
  WEEK4_MATCHUP_B,
];

/** Minimal season batting stats so the projection engine produces non-zero values. */
const MOCK_SEASON_BATTING = {
  __typename: 'SeasonBattingStats',
  games: 80,
  plateAppearances: 320,
  atBats: 280,
  runs: 40,
  hits: 75,
  doubles: 15,
  triples: 2,
  homeRuns: 10,
  rbi: 35,
  stolenBases: 5,
  caughtStealing: 2,
  baseOnBalls: 30,
  strikeouts: 60,
  groundedIntoDoublePlays: 5,
  hitByPitch: 3,
  sacrificeHits: 1,
  intentionalBaseOnBalls: 1,
};

const MOCK_MATCHUP_PLAYERS = [
  {
    __typename: 'MatchupPlayer',
    id: 1,
    matchupId: MATCHUP_ID_WEEK3,
    playerId: 100,
    teamId: 1,
    positionId: 1,
    numberOfGames: 7,
    season: 2025,
    games: [],
    seasonBatting: MOCK_SEASON_BATTING,
    seasonPitching: null,
    seasonFielding: null,
  },
  {
    __typename: 'MatchupPlayer',
    id: 2,
    matchupId: MATCHUP_ID_WEEK3,
    playerId: 200,
    teamId: 2,
    positionId: 1,
    numberOfGames: 7,
    season: 2025,
    games: [],
    seasonBatting: { ...MOCK_SEASON_BATTING, hits: 70, homeRuns: 8, runs: 35 },
    seasonPitching: null,
    seasonFielding: null,
  },
];

// ---------------------------------------------------------------------------
// Premium user mock — returns subscriptionTier: 'premium' from GetUserById
// ---------------------------------------------------------------------------

function premiumUserResponse() {
  return {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accessLevel: 'none',
        subscriptionTier: 'premium',
      },
    },
  };
}

function freeUserResponse() {
  return {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accessLevel: 'none',
        subscriptionTier: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Route handler factory
// ---------------------------------------------------------------------------

/**
 * Sets up GraphQL mocks for the matchup detail page.
 *
 * @param page - Playwright page
 * @param opts.isPremium - Whether the user should have premium access
 * @param opts.currentMatchup - The matchup returned by GetMatchupById
 */
async function mockMatchupGraphQL(
  page: import('@playwright/test').Page,
  opts: { isPremium?: boolean; currentMatchup?: Record<string, unknown> } = {},
) {
  const { isPremium = false, currentMatchup = WEEK3_MATCHUP } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData() ?? '';
      let opName = '';
      try {
        const body = JSON.parse(postData) as { operationName?: string };
        opName = (body.operationName ?? '').toLowerCase();
      } catch {
        opName = postData.toLowerCase();
      }

      if (opName.includes('getmatchupbyid') || opName.includes('matchupbyid')) {
        // Parse the matchupId from variables to return the right matchup
        let requestedId: number | null = null;
        try {
          const body = JSON.parse(postData) as { variables?: { id?: number } };
          requestedId = body.variables?.id ?? null;
        } catch {
          // fall through
        }

        const found =
          ALL_MATCHUPS.find((m) => m.id === String(requestedId)) ??
          currentMatchup;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: found } }),
        });
      } else if (
        opName.includes('getmatchupsforleague') ||
        opName.includes('matchupsforleague')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: ALL_MATCHUPS },
          }),
        });
      } else if (
        opName.includes('getmatchupsbyweek') ||
        opName.includes('matchupsbyweek')
      ) {
        let weekNumber: number | null = null;
        try {
          const body = JSON.parse(postData) as {
            variables?: { weekNumber?: number };
          };
          weekNumber = body.variables?.weekNumber ?? null;
        } catch {
          // fall through
        }
        const weekMatchups = ALL_MATCHUPS.filter(
          (m) => m.weekNumber === weekNumber,
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsByWeek: weekMatchups },
          }),
        });
      } else if (
        opName.includes('getcurrentweekforleague') ||
        opName.includes('currentweek')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (
        opName.includes('getuserteamid') ||
        opName.includes('userteamid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (
        opName.includes('getleagueteams') ||
        opName.includes('leagueteams')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (
        opName.includes('getmatchupplayers') ||
        opName.includes('matchupplayers')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupPlayers: MOCK_MATCHUP_PLAYERS },
          }),
        });
      } else if (
        opName.includes('getuserbyid') ||
        opName.includes('userbyid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            isPremium ? premiumUserResponse() : freeUserResponse(),
          ),
        });
      } else if (
        opName.includes('getmysubscription') ||
        opName.includes('mysubscription')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              mySubscription: isPremium
                ? {
                    __typename: 'Subscription',
                    id: 1,
                    status: 'active',
                    tier: 'premium',
                  }
                : null,
            },
          }),
        });
      } else {
        // Let unknown operations fall back to the baseline mocks
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests – current week display with scores
// ---------------------------------------------------------------------------

test.describe('Matchup Week Navigation – current week display @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockMatchupGraphQL(page);
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('loads the matchup detail page showing current week', async ({
    page,
  }) => {
    await expect(page).toHaveURL(MATCHUP_URL);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('displays the current week number with scores', async ({ page }) => {
    // The MatchupNavigationControls stepper shows "Week 3"
    await expect(page.getByText('Week 3').first()).toBeVisible();

    // Wait for the matchup cards to load (they depend on GetMatchupsByWeek)
    const userMatchupCard = page.getByLabel('Alpha Squad vs Beta Force', {
      exact: true,
    });
    await expect(userMatchupCard).toBeVisible();

    // Team scores should be visible inside the navigation matchup cards
    await expect(userMatchupCard.getByText('42.5')).toBeVisible();
    await expect(userMatchupCard.getByText('38.1')).toBeVisible();
  });

  test('shows team names for the current matchup', async ({ page }) => {
    // Team names appear in the scoreboard region which has an aria-label
    // containing both team names. Use the region role to scope precisely.
    const scoreboard = page.getByRole('region', {
      name: /Alpha Squad vs Beta Force/,
    });
    await expect(scoreboard).toBeVisible();

    await expect(scoreboard.getByText('Alpha Squad').first()).toBeVisible();
    await expect(scoreboard.getByText('Beta Force').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – week navigation buttons
// ---------------------------------------------------------------------------

test.describe('Matchup Week Navigation – stepper controls @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockMatchupGraphQL(page);
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('previous and next week buttons are visible', async ({ page }) => {
    const prevButton = page.getByLabel('Previous week');
    const nextButton = page.getByLabel('Next week');

    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();
  });

  test('previous week button is disabled on the first available week', async ({
    page,
  }) => {
    // Week 3 is the first available week (weeks 3 and 4 exist).
    // The StepperButton uses an `disabled` variant that sets opacity to 0.3.
    const prevButton = page.getByLabel('Previous week');
    await expect(prevButton).toBeVisible();

    // Check that the button has the disabled attribute (Tamagui renders aria-disabled)
    await expect(prevButton).toHaveAttribute('aria-disabled', 'true');
  });

  test('clicking next week loads week 4 matchup data', async ({ page }) => {
    const nextButton = page.getByLabel('Next week');
    await expect(nextButton).toBeVisible();

    await nextButton.click();

    // After clicking next, the stepper should now show "Week 4"
    await expect(page.getByText('Week 4').first()).toBeVisible();

    // The navigation auto-selects the user's matchup in the new week.
    // Week 4 matchup has team1Id=1 (user's team) vs team3Id=3 (Gamma Rays),
    // so the page navigates to the week 4 matchup. Wait for the scoreboard
    // region to update to show the new matchup.
    const week4Scoreboard = page.getByRole('region', {
      name: /Alpha Squad vs Gamma Rays/,
    });
    await expect(week4Scoreboard).toBeVisible();
    await expect(week4Scoreboard.getByText('Gamma Rays').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – win probability for premium users
//
// Use a non-admin auth identity so the useIsPremium hook falls through to
// the GetUserById subscriptionTier check rather than short-circuiting on
// accessLevel === 'admin'.
// ---------------------------------------------------------------------------

const premiumTest = createCustomAuthTest('premium@test.com');

premiumTest.describe(
  'Matchup Week Navigation – win probability (premium) @regression',
  () => {
    premiumTest.beforeEach(async ({ page }) => {
      await mockMatchupGraphQL(page, { isPremium: true });
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');
    });

    premiumTest(
      'win probability panel is visible for premium users',
      async ({ page }) => {
        // The MatchupWinProbabilityPanel header contains "Win Probability".
        // Use first() because the label appears in both the header and the
        // ProbabilityBar ("WIN PROBABILITY").
        await expect(page.getByText('Win Probability').first()).toBeVisible();
      },
    );

    premiumTest(
      'premium user does not see the upgrade prompt overlay',
      async ({ page }) => {
        // PremiumGate shows "Premium Feature" text and "Upgrade to Premium" button
        // for free users. Premium users should NOT see these.
        await expect(page.getByText('Premium Feature')).not.toBeVisible();
        await expect(
          page.getByRole('button', { name: /upgrade to premium/i }),
        ).not.toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests – win probability hidden for non-premium users
//
// Same non-admin identity — the mock returns subscriptionTier: null so
// useIsPremium resolves to false, exercising the PremiumGate overlay path.
// ---------------------------------------------------------------------------

const freeTest = createCustomAuthTest('free@test.com');

freeTest.describe(
  'Matchup Week Navigation – win probability (free user) @regression',
  () => {
    freeTest.beforeEach(async ({ page }) => {
      await mockMatchupGraphQL(page, { isPremium: false });
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');
    });

    freeTest(
      'free user sees the premium gate overlay instead of win probability',
      async ({ page }) => {
        // The PremiumGate shows the "Premium Feature" text and upgrade CTA
        await expect(page.getByText('Premium Feature')).toBeVisible();
        await expect(
          page.getByRole('button', { name: /upgrade to premium/i }),
        ).toBeVisible();
      },
    );

    freeTest(
      'free user sees the feature description in the gate overlay',
      async ({ page }) => {
        // The PremiumGate renders the featureDescription from MatchupDetailPage:
        // "See win probability and projected scores for every matchup based on remaining games."
        await expect(
          page.getByText(/win probability and projected scores/i),
        ).toBeVisible();
      },
    );
  },
);
