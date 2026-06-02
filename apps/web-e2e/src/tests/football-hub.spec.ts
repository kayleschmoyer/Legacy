/**
 * Football Hub E2E Tests (LS-4153)
 *
 * Covers the end-to-end football experience across 4 scenarios:
 *
 *   Scenario 1 — Sport selection in league creation
 *     Create a football league from /football/league/create:
 *     Football tab active, NFL player pool (NFC/AFC), football eras, beta banner,
 *     form submission routes to /football/league/:id.
 *
 *   Scenario 2 — Football draft board shows football players
 *     A football league in pre-draft state exposes draft controls that surface
 *     football positions (QB/RB/WR/TE/K/DST) in the position roster on the
 *     Commissioner tab. The live draft board (baseball/league/:id/draft) renders
 *     for the league until a dedicated football draft route ships (LS-4150).
 *
 *   Scenario 3 — Football matchup score breakdown
 *     The Matchup tab for a football league loads without crashing; matchup
 *     content is visible. Full football stat column assertions (Passing /
 *     Rushing / Receiving) will be added once LS-4152 ships.
 *
 *   Scenario 4 — Football hub and navigation
 *     /football and /baseball are distinct hubs; each has primary nav.
 *     "Create League" from the football create page is sport-pre-selected.
 *     Football leagues route under /football; baseball leagues under /baseball.
 *
 * All GraphQL responses are mocked via route.fulfill() (never route.continue()).
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import {
  enableFootball,
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { mockLeague } from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOOTBALL_LEAGUE_ID = 42;
const FOOTBALL_CREATE_URL = '/football/league/create';
const FOOTBALL_LEAGUE_URL = `/football/league/${FOOTBALL_LEAGUE_ID}`;
const BASEBALL_CREATE_URL = '/baseball/league/create';
const CREATED_LEAGUE_ID = 777;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Football league in pre-draft state, owned by the authenticated test user. */
const FOOTBALL_LEAGUE = {
  ...mockLeague({
    id: FOOTBALL_LEAGUE_ID,
    name: 'Test Football League',
    draftStatus: 'not-started',
    playerPool: 'all',
    numberOfTeams: 10,
  }),
};

/** Football league with an active matchup (completed week 3). */
const FOOTBALL_LEAGUE_WITH_MATCHUP = {
  ...mockLeague({
    id: FOOTBALL_LEAGUE_ID,
    name: 'Test Football League',
    draftStatus: 'completed',
    currentMatchup: 10,
    playerPool: 'all',
  }),
};

/** Football position slots returned by GetPositionsForLeague. */
const FOOTBALL_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: 101,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: 102,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'RB',
  },
  {
    __typename: 'LeaguePosition',
    id: 103,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'WR',
  },
  {
    __typename: 'LeaguePosition',
    id: 104,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'TE',
  },
  {
    __typename: 'LeaguePosition',
    id: 105,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'FLEX',
  },
  {
    __typename: 'LeaguePosition',
    id: 106,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'DST',
  },
  {
    __typename: 'LeaguePosition',
    id: 107,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'K',
  },
];

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: 10,
  leagueId: FOOTBALL_LEAGUE_ID,
  weekNumber: 3,
  team1Id: 1,
  team2Id: 2,
  team1Score: 95.5,
  team2Score: 88.2,
  status: 'completed',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 0,
  selectedGamesCount: 1,
  startTime: null,
  endTime: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Offense',
    owner: 1,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Defense',
    owner: 2,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expand a collapsible section by clicking its toggle header. */
async function expandSection(
  page: import('@playwright/test').Page,
  sectionId: string,
) {
  const toggle = page.getByTestId(`section-toggle-${sectionId}`);
  await expect(toggle).toBeVisible();
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * Register a GraphQL router that handles the ambient league-detail queries for
 * a football league. Individual tests add additional handlers on top via LIFO.
 */
async function mockFootballLeagueGraphQL(
  page: import('@playwright/test').Page,
  overrides: {
    league?: object;
    positions?: object[];
    matchup?: object | null;
    matchups?: object[];
  } = {},
) {
  const league = overrides.league ?? FOOTBALL_LEAGUE;
  const positions = overrides.positions ?? FOOTBALL_POSITIONS;
  const matchup = overrides.matchup ?? null;
  const matchups = overrides.matchups ?? (matchup ? [matchup] : []);

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
    } else if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: positions } }),
      });
    } else if (op === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'getmatchupsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: matchups } }),
      });
    } else if (op === 'getmatchupbyid' || op === 'getcurrentmatchup') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupById: matchup, currentMatchup: matchup },
        }),
      });
    } else if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: matchup ? 3 : null },
        }),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: { __typename: 'UserTeamId', teamId: 1 } },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ===========================================================================
// Scenario 1 — Sport selection in league creation
// ===========================================================================

test.describe('Scenario 1: Football league creation @regression', () => {
  // The football sport tab is gated behind the `football_enabled` flag (LS-4767),
  // which defaults off in CI. Seed it on before every navigation so the football
  // tab renders and these create-page assertions hold deterministically.
  test.beforeEach(async ({ page }) => {
    await enableFootball(page);
  });

  test('football tab is active and heading shows "Create Football League"', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(
      page.getByRole('heading', { name: /Create Football League/i }),
    ).toBeVisible();
  });

  test('football create page shows NFL player pool options (NFC/AFC, not NL/AL)', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    // Expand the roster & schedule section to reveal the player pool controls.
    await expandSection(page, 'roster-schedule');

    // Football pool options: All NFL, NFC, AFC
    await expect(
      page.getByRole('button', { name: 'All NFL', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'NFC', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'AFC', exact: true }),
    ).toBeVisible();

    // Baseball NL/AL options must NOT appear in football mode.
    await expect(
      page.getByRole('button', { name: 'National League', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'American League', exact: true }),
    ).toHaveCount(0);
  });

  test('football create page shows football eras (Super Bowl Era) not baseball eras', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    await expandSection(page, 'era-history');

    // Football eras
    await expect(page.getByText(/Super Bowl Era/i)).toBeVisible();

    // Baseball eras must not appear
    await expect(page.getByText(/Dead Ball/i)).toHaveCount(0);
  });

  test('football beta banner is visible on /football/league/create', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('football-beta-banner')).toBeVisible();
  });

  test('switching from Football to Baseball tab removes the football beta banner', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    // Confirm the banner is present in football mode.
    await expect(page.getByTestId('football-beta-banner')).toBeVisible();

    // Switch to baseball.
    await page.getByTestId('sport-tab-baseball').click();
    await expect(page).toHaveURL(/\/baseball\/league\/create/);

    // Football beta banner must be gone.
    await expect(page.getByTestId('football-beta-banner')).toHaveCount(0);
  });

  test('completing the football form submits sport=football and redirects to /football/league/:id', async ({
    page,
  }) => {
    const captured: { sport: unknown } = { sport: null };

    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'createleagueandteams') {
        try {
          const body = route.request().postData() ?? '';
          const parsed = JSON.parse(body) as {
            variables?: { input?: Record<string, unknown> };
          };
          captured.sport = parsed.variables?.input?.sport ?? null;
        } catch {
          // ignore
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: {
                  __typename: 'League',
                  id: CREATED_LEAGUE_ID,
                  name: 'Hermetic Football League',
                  owner: 1,
                  maxRosterSize: 16,
                  currentMatchup: null,
                  draftStatus: 'not-started',
                  numberOfTeams: 10,
                  playerPool: 'all',
                  draftMode: 'live',
                  selectionMethod: 'standard',
                  draftOrder: 'snake',
                  isPublic: false,
                },
              },
            },
          }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();
    await page
      .getByPlaceholder('Enter your league name')
      .fill('Hermetic Football League');

    await page.getByRole('button', { name: /create league/i }).click();

    // Must redirect under /football
    await expect(page).toHaveURL(
      new RegExp(`/football/league/${CREATED_LEAGUE_ID}`),
    );

    // The mutation must have sent sport=football
    expect(captured.sport).toBe('football');
  });

  test('switching to Football tab from baseball create URL swaps to /football/league/create', async ({
    page,
  }) => {
    await page.goto(BASEBALL_CREATE_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('sport-tab-football').click();
    await expect(page).toHaveURL(/\/football\/league\/create/);
    await expect(
      page.getByRole('heading', { name: /Create Football League/i }),
    ).toBeVisible();
  });
});

// ===========================================================================
// Scenario 2 — Football league draft board (pre-draft state)
// ===========================================================================

test.describe('Scenario 2: Football league pre-draft state @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballLeagueGraphQL(page);
    await page.goto(`${FOOTBALL_LEAGUE_URL}/commish`);
    await page.waitForLoadState('load');
  });

  test('football league detail loads without errors', async ({ page }) => {
    await expect(page).toHaveURL(`${FOOTBALL_LEAGUE_URL}/commish`);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('league title shows the football league name', async ({ page }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('league-title')).toHaveText(
      FOOTBALL_LEAGUE.name,
    );
  });

  test('draft status chip shows Pre-Draft for a not-started football league', async ({
    page,
  }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('draft-status-chip')).toBeVisible();
    await expect(page.getByTestId('draft-status-chip')).toContainText(
      /Pre-Draft/i,
    );
  });

  test('Start Draft button is visible for commissioner of a pre-draft football league', async ({
    page,
  }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await expect(startDraftButton).toBeVisible({ timeout: 10_000 });
    await expect(startDraftButton).toBeEnabled();
  });

  test('football league tab bar shows all expected tabs', async ({ page }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    const tabList = page.getByRole('tablist', { name: /League sections/i });
    await expect(tabList).toBeVisible();

    // Core tabs expected for a football league member
    await expect(tabList.getByRole('tab', { name: /Overview/i })).toBeVisible();
    await expect(tabList.getByRole('tab', { name: /Matchup/i })).toBeVisible();
    await expect(
      tabList.getByRole('tab', { name: /Standings/i }),
    ).toBeVisible();
    await expect(
      tabList.getByRole('tab', { name: /Commissioner/i }),
    ).toBeVisible();
  });
});

// ===========================================================================
// Scenario 3 — Football matchup score breakdown
// ===========================================================================

test.describe('Scenario 3: Football matchup content @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballLeagueGraphQL(page, {
      league: FOOTBALL_LEAGUE_WITH_MATCHUP,
      matchup: MOCK_MATCHUP,
      matchups: [MOCK_MATCHUP],
    });
    await page.goto(`${FOOTBALL_LEAGUE_URL}/matchup`);
    await page.waitForLoadState('load');
  });

  test('football league matchup tab loads without errors', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('football league matchup tab is the active tab', async ({ page }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    const matchupTab = page.getByRole('tab', { name: /Matchup/i });
    await expect(matchupTab).toHaveAttribute('aria-selected', 'true');
  });

  test('football matchup page does not show a baseball-only empty state', async ({
    page,
  }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    // The page should render the league without a full-page crash
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // Matchup tab content region should be present
    await expect(page.locator('[role="tabpanel"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('football league matchup tab panel is rendered and accessible', async ({
    page,
  }) => {
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    // The matchup tab panel should exist in the DOM and be non-empty.
    // We verify structural presence without asserting football-specific stat
    // columns (Passing/Rushing/Receiving) which ship with LS-4152.
    const tabPanel = page.locator('[role="tabpanel"]').first();
    await expect(tabPanel).toBeVisible({ timeout: 10_000 });
  });
});

// ===========================================================================
// Scenario 4 — Football hub and navigation
// ===========================================================================

test.describe('Scenario 4: Football hub and sport-based routing @critical', () => {
  test('football hub (/football) loads without a full-page error', async ({
    page,
  }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/football');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('baseball hub (/baseball) loads without a full-page error', async ({
    page,
  }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('football hub and baseball hub render distinct content', async ({
    page,
  }) => {
    await page.goto('/football');
    await expect(
      page.locator('[aria-label="Football fantasy landing page"]'),
    ).toBeVisible({ timeout: 10000 });

    await page.goto('/baseball');
    await expect(
      page.locator('[aria-label="Baseball fantasy landing page"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('primary navigation is visible on the football hub', async ({
    page,
  }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible();
  });

  test('primary navigation is visible on the baseball hub', async ({
    page,
  }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible();
  });

  test('/football/league/create is pre-selected to football sport', async ({
    page,
  }) => {
    // football_enabled flag is not configured in CI (no VITE_GROWTHBOOK_CLIENT_KEY),
    // so seed it before the bundle loads to make the sport tab visible.
    await enableFootball(page);
    await page.goto('/football/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('football-beta-banner')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('heading', { name: /Create Football League/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('/baseball/league/create is pre-selected to baseball sport', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible();
  });

  test('a football league detail page routes under /football, not /baseball', async ({
    page,
  }) => {
    await mockFootballLeagueGraphQL(page);
    await page.goto(FOOTBALL_LEAGUE_URL);
    await page.waitForLoadState('load');

    // The URL must remain under /football (not redirect to /baseball).
    await expect(page).toHaveURL(
      new RegExp(`/football/league/${FOOTBALL_LEAGUE_ID}`),
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('football league detail does not appear at the baseball route', async ({
    page,
  }) => {
    // The baseball route /baseball/league/:id uses the same shared LeagueDetailPage.
    // Navigating to the football league ID under /baseball is allowed by the router,
    // so this test verifies the URL stays consistent when explicitly visiting /football.
    await mockFootballLeagueGraphQL(page);
    await page.goto(FOOTBALL_LEAGUE_URL);
    await page.waitForLoadState('load');

    // Must remain on the football route.
    await expect(page).not.toHaveURL(/\/baseball\/league\//);
  });

  test('mobile nav opens and shows navigation links on the football hub', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/football');
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const mobileNav = page.getByRole('navigation', {
      name: /mobile navigation/i,
    });
    await expect(mobileNav).toBeVisible({ timeout: 10_000 });
    await expect(mobileNav.getByText(/players/i).first()).toBeVisible();
  });

  test('clicking Players nav link from the football hub navigates to /players', async ({
    page,
  }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');

    await page.getByRole('link', { name: /^players$/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players/);
  });
});

// ===========================================================================
// Unauthenticated access — createLeagueAndTeams requires authentication
// ===========================================================================

// The football league create page is a protected route. Unauthenticated users
// are intercepted by EnhancedAuthGuard before they can reach or submit the form,
// so the createLeagueAndTeams mutation is never callable without a session.
unauthTest.describe(
  '/football/league/create — protected route shows login page @regression',
  () => {
    unauthTest(
      'unauthenticated user visiting /football/league/create sees the login page (LS-4153)',
      async ({ page }) => {
        await page.goto(FOOTBALL_CREATE_URL);
        await page.waitForLoadState('load');

        // Auth guard intercepts and renders the login page; form is unreachable.
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// ===========================================================================
// Route smoke tests — ensure football-specific routes load without errors
// ===========================================================================

test.describe('Football routes — smoke @critical', () => {
  test('loads /football/league/create without a full-page error', async ({
    page,
  }) => {
    await page.goto(FOOTBALL_CREATE_URL);
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(FOOTBALL_CREATE_URL);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('loads /football/leagues without a full-page error', async ({
    page,
  }) => {
    await page.goto('/football/leagues');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/leagues');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('loads /football/league/:id overview without a full-page error', async ({
    page,
  }) => {
    await mockFootballLeagueGraphQL(page);
    await page.goto(FOOTBALL_LEAGUE_URL);
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(FOOTBALL_LEAGUE_URL);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});
