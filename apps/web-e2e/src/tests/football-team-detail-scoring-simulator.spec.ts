/**
 * Football Team Detail — Scoring Format Simulator premium gate E2E (LS-6454 /
 * FTD-028).
 *
 * Covers the `ScoringFormatSimulator` panel on `/football/teams/:teamId`:
 *   - Premium user expands the panel and sees a simulated total per format
 *   - Premium user's Standard row shows the reception points they would lose
 *   - Free user expands onto the `premium-feature-gate` overlay instead
 *   - Free user's "Upgrade to Premium" CTA opens the UpgradeModal
 *
 * Hermetic: every GraphQL operation is answered with `route.fulfill()`; the
 * rest cascade to `unmockedGraphQLFallback`. No live backend.
 */

import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const TEAM_ID = 1;
const WEEK = 3;
const TEAM_URL = `/football/teams/${TEAM_ID}`;

/** Six receptions across the roster, in a PPR (rec = 1) league. */
const TEAM_TOTAL = 96.5;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TEAM = {
  __typename: 'Team',
  id: TEAM_ID,
  name: 'Gridiron FC',
  leagueId: LEAGUE_ID,
  avatarUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
};

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Sunday Money',
  sport: 'football',
  defensiveFormat: 'dst',
  currentWeekNumber: WEEK,
};

/** PPR: the receiving `rec` multiplier is what the simulator varies. */
const MOCK_SCORING_PROFILE = {
  __typename: 'ScoringConfig',
  leagueId: LEAGUE_ID,
  profileId: 1,
  profileName: 'Default',
  stats: [
    {
      __typename: 'ScoringConfigEntry',
      multiplier: 1,
      isEnabled: true,
      definition: {
        __typename: 'ScoringStatDefinition',
        statGroup: 'receiving',
        statKey: 'rec',
        displayName: 'Reception',
      },
    },
  ],
};

const MOCK_MATCHUP_SCORES = [
  {
    __typename: 'FootballMatchupStats',
    teamId: TEAM_ID,
    teamName: MOCK_TEAM.name,
    totalPoints: TEAM_TOTAL,
    projectedPoints: TEAM_TOTAL,
    players: [
      {
        __typename: 'FootballMatchupPlayer',
        playerId: 7,
        playerName: 'Wideout One',
        position: 'WR',
        totalPoints: 24.1,
        projectedPoints: 24.1,
        games: [
          {
            __typename: 'FootballMatchupPlayerGame',
            gameNum: 1,
            receiving: {
              __typename: 'FootballGameReceivingStats',
              rec: 4,
              yds: 61,
              td: 1,
            },
          },
        ],
      },
      {
        __typename: 'FootballMatchupPlayer',
        playerId: 8,
        playerName: 'Tight End Two',
        position: 'TE',
        totalPoints: 12.4,
        projectedPoints: 12.4,
        games: [
          {
            __typename: 'FootballMatchupPlayerGame',
            gameNum: 1,
            receiving: {
              __typename: 'FootballGameReceivingStats',
              rec: 2,
              yds: 18,
              td: 0,
            },
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function mockTeamDetailGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetTeamMembers') {
      // An empty roster is enough: the page's "Team not found" guard only
      // checks that `teamMembers` is present, and the simulator reads its
      // players from MatchupScores, not from the roster.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (op === 'GetViewerMembership') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            viewerMembership: {
              __typename: 'ViewerMembership',
              teamId: TEAM_ID,
              permissionLevel: 'general_manager',
            },
          },
        }),
      });
    } else if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else if (op === 'GetTeamById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { team: MOCK_TEAM } }),
      });
    } else if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetLeagueScoringProfile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leagueScoringProfile: MOCK_SCORING_PROFILE },
        }),
      });
    } else if (op === 'MatchupScores') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { matchupScores: MOCK_MATCHUP_SCORES } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Fixtures — non-admin identities so entitlement resolves off GetUserById
// rather than short-circuiting on accessLevel === 'admin'.
// ---------------------------------------------------------------------------

const freeTest = createCustomAuthTest('scoring-sim-free@test.com');
const premiumTest = createCustomAuthTest('scoring-sim-premium@test.com');

const SIMULATOR = 'football-scoring-simulator';

// ---------------------------------------------------------------------------
// Premium user
// ---------------------------------------------------------------------------

premiumTest.describe(
  'Football Team Detail – scoring format simulator (premium) @regression',
  () => {
    premiumTest.beforeEach(async ({ page }) => {
      await mockTeamDetailGraphQL(page);
      await page.goto(TEAM_URL);
      await page.waitForLoadState('load');
    });

    premiumTest(
      'expands to show a simulated total for every scoring format',
      async ({ page }) => {
        await expect(page.getByTestId(SIMULATOR)).toBeVisible();
        // Collapsed by default — the results only exist once toggled.
        await expect(page.getByTestId(`${SIMULATOR}-results`)).toBeHidden();

        await page.getByTestId(`${SIMULATOR}-toggle`).click();

        await expect(page.getByTestId(`${SIMULATOR}-results`)).toBeVisible();
        await expect(
          page.getByTestId(`${SIMULATOR}-format-standard`),
        ).toBeVisible();
        await expect(
          page.getByTestId(`${SIMULATOR}-format-half_ppr`),
        ).toBeVisible();
        await expect(page.getByTestId(`${SIMULATOR}-format-ppr`)).toBeVisible();
      },
    );

    premiumTest(
      'shows the reception points a Standard league would cost, and no change for the league own format',
      async ({ page }) => {
        await page.getByTestId(`${SIMULATOR}-toggle`).click();

        // Six receptions in a PPR league: Standard costs exactly 6 points.
        await expect(
          page.getByTestId(`${SIMULATOR}-delta-standard`),
        ).toHaveText('-6.00');
        await expect(
          page.getByTestId(`${SIMULATOR}-delta-half_ppr`),
        ).toHaveText('-3.00');
        // The league's own format is the baseline — zero delta by construction.
        await expect(page.getByTestId(`${SIMULATOR}-delta-ppr`)).toHaveText(
          '—',
        );
        await expect(page.getByTestId(`${SIMULATOR}-baseline`)).toBeVisible();
      },
    );

    premiumTest('does not show the premium gate', async ({ page }) => {
      await page.getByTestId(`${SIMULATOR}-toggle`).click();
      await expect(page.getByTestId('premium-feature-gate')).toBeHidden();
    });
  },
);

// ---------------------------------------------------------------------------
// Free user
// ---------------------------------------------------------------------------

freeTest.describe(
  'Football Team Detail – scoring format simulator (free) @regression',
  () => {
    freeTest.beforeEach(async ({ page }) => {
      await mockTeamDetailGraphQL(page);
      await useTier(page, 'free');
      await page.goto(TEAM_URL);
      await page.waitForLoadState('load');
    });

    freeTest(
      'expands onto the premium gate instead of the simulated totals',
      async ({ page }) => {
        await page.getByTestId(`${SIMULATOR}-toggle`).click();

        await expect(page.getByTestId('premium-feature-gate')).toBeVisible();
        await expect(page.getByTestId(`${SIMULATOR}-results`)).toBeHidden();
      },
    );

    freeTest('upgrade CTA opens the upgrade modal', async ({ page }) => {
      await page.getByTestId(`${SIMULATOR}-toggle`).click();

      await page.getByRole('button', { name: /upgrade to premium/i }).click();

      await expect(
        page.getByText(/unlock scoring format simulator/i),
      ).toBeVisible();
    });
  },
);
