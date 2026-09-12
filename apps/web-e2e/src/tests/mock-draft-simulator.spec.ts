/**
 * Mock Draft Simulator E2E Tests (LS-1614)
 *
 * Covers: setup screen rendering, settings UI, start button, and premium gate.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** League owned by user id=1, with mock-draft settings. */
const MOCK_LEAGUE = {
  __typename: 'League',
  id: 99,
  name: 'Mock Draft League',
  description: 'Auto-generated mock draft league',
  owner: 1,
  maxRosterSize: 10,
  draftStatus: 'not-started',
  currentMatchup: null,
  numberOfTeams: 8,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: false,
  waiverEnabled: false,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: null,
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  isMockDraft: true,
};

const MOCK_TEAMS = Array.from({ length: 4 }, (_, i) => ({
  __typename: 'Team',
  id: i + 1,
  name: `Team ${i + 1}`,
  owner: i + 1,
  leagueId: MOCK_LEAGUE.id,
  waiverOrder: i + 1,
  faabBudget: 100,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
}));

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
];

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

async function setupGraphQL(
  page: import('@playwright/test').Page,
  /** LS-9253: when provided, records the variables of the last
   *  initializeMockDraft request the client sent, for assertions. */
  capture?: { initializeMockDraftVariables?: Record<string, unknown> },
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    // GetUserById (premium) is served by the shared premium-by-default
    // baseline (LS-8058); the ad-hoc premium mock was removed.
    if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (operation === 'getmymockdraftusage') {
      // Premium user → unlimited weekly mock drafts, so the setup form
      // renders (never the LimitReachedScreen) and no usage label is shown
      // (LS-5178). Without this mock the query falls through to the
      // _apiIsolation baseline, which flags it as an unmocked operation and
      // fails every test in the suite (LS-6400).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMyMockDraftUsage: {
              __typename: 'MockDraftUsage',
              isUnlimited: true,
              used: 0,
              limit: 2,
              remaining: 2,
            },
          },
        }),
      });
    } else if (operation === 'initializemockdraft') {
      if (capture) {
        const body = route.request().postDataJSON() as {
          variables?: Record<string, unknown>;
        };
        capture.initializeMockDraftVariables = body.variables;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            initializeMockDraft: {
              leagueId: MOCK_LEAGUE.id,
              draftId: 1,
            },
          },
        }),
      });
    } else if (operation === 'getleaguedraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueDraft: null } }),
      });
    } else if (operation === 'getdraftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftTeamOrder: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Mock Draft Simulator @regression', () => {
  test('mock draft page renders with setup screen', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    // Heading
    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Practice Mode badge
    await expect(page.getByText(/Practice Mode/i)).toBeVisible();

    // Description text
    await expect(
      page.getByText(/Practice your draft strategy against AI opponents/i),
    ).toBeVisible();
  });

  test('setup screen shows team count options', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // All team count buttons are visible
    for (const n of [4, 6, 8, 10, 12]) {
      await expect(
        page.getByRole('button', { name: String(n), exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('setup screen has no roster size (rounds) setting (LS-10086)', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // A mock draft always runs the sport's full default roster, so the form
    // no longer collects a roster size.
    await expect(page.getByText('Rounds (Roster Size)')).toHaveCount(0);
  });

  test('empty draft state shows Start Mock Draft button', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Start button is visible and enabled
    const startBtn = page.getByRole('button', { name: /Start Mock Draft/i });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();
  });

  test('shows the Control All Teams option as a visible upgrade surface (LS-9253)', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(page.getByText('Control All Teams')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Off', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'On', exact: true }),
    ).toBeVisible();
  });

  test('starting a draft with Control All Teams on sends controlAllTeams:true to initializeMockDraft (LS-9253)', async ({
    page,
  }) => {
    const capture: { initializeMockDraftVariables?: Record<string, unknown> } =
      {};
    await setupGraphQL(page, capture);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    // This suite's baseline JWT is premium (LS-8058), so the option is
    // entitled here — selecting "On" enables the setting rather than
    // routing to an upgrade CTA.
    await page.getByRole('button', { name: 'On', exact: true }).click();
    await page.getByRole('button', { name: /Start Mock Draft/i }).click();

    await expect
      .poll(() => capture.initializeMockDraftVariables)
      .toMatchObject({ controlAllTeams: true, isOffline: true });
  });

  test('draft position buttons update when team count changes', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Default is 8 teams — position 8 should be visible
    await expect(
      page.getByRole('button', { name: '8', exact: true }).first(),
    ).toBeVisible();

    // Select 4 teams
    await page.getByRole('button', { name: '4', exact: true }).first().click();

    // Position 1 should still be visible
    await expect(
      page.getByRole('button', { name: '1', exact: true }).first(),
    ).toBeVisible();
  });

  test('snake draft description updates for position 1', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Position 1 is the default — verify the snake draft description
    await expect(
      page.getByText(/you pick.*first every odd round/i),
    ).toBeVisible();
  });

  test('setup screen shows draft order options', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Draft order label is visible
    await expect(page.getByText(/Draft Order/i).first()).toBeVisible();

    // Both draft order buttons are visible
    await expect(
      page.getByRole('button', { name: 'Snake', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Linear', exact: true }),
    ).toBeVisible();

    // Snake is selected by default
    const snakeBtn = page.getByRole('button', { name: 'Snake', exact: true });
    await expect(snakeBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('selecting linear draft order updates description', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Switch to linear draft order
    await page.getByRole('button', { name: 'Linear', exact: true }).click();

    // Description should update for linear draft
    await expect(
      page.getByText(/Linear draft.*at position \d+ every round/i),
    ).toBeVisible();
  });

  test('setup screen shows player pool options', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Player pool label is visible
    await expect(page.getByText(/Player Pool/i).first()).toBeVisible();

    // All three player pool buttons are visible
    await expect(
      page.getByRole('button', { name: 'All MLB', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'NL Only', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'AL Only', exact: true }),
    ).toBeVisible();

    // All MLB is selected by default
    const allMlbBtn = page.getByRole('button', {
      name: 'All MLB',
      exact: true,
    });
    await expect(allMlbBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('cancel button is present on setup screen', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Cancel button navigates back to baseball landing
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  });

  test('info line about mock drafts is visible', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // Footer info text
    await expect(
      page.getByText(/Mock drafts don't affect any real leagues/i),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LS-3485: /baseball/mock-draft is a protected route. Unauthenticated users
// visiting /baseball/mock-draft are intercepted by EnhancedAuthGuard and shown
// PublicLandingPage with the "Build Your Dynasty" headline, "Season 2026"
// badge, and "Continue with Google" / "Continue with Discord" sign-in CTAs.
// (The ambiguous "Get Started Free" label that silently selected Google —
// OBD-002 / LS-6915 — was reworked into these explicit buttons; the stale
// "Get Started Free" cases were removed in LS-7785.) The original automated
// scanner tried to locate the button with the invalid CSS selector
// `(button:visible, [role="button"]:visible)`, which throws a parse error.
// These tests lock in the expected unauthenticated rendering and confirm every
// CTA is reachable via getByRole.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Mock Draft — unauthenticated visitor sees marketing page @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball/mock-draft');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows marketing headline on /baseball/mock-draft when unauthenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /claim your dynasty/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'shows "Members Clubhouse" eyebrow on /baseball/mock-draft when unauthenticated',
      async ({ page }) => {
        await expect(page.getByText(/members clubhouse/i)).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Continue with Google" button is visible on /baseball/mock-draft when unauthenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Google" button on /baseball/mock-draft is clickable via getByRole',
      async ({ page }) => {
        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        await googleBtn.click({ noWaitAfter: true });
      },
    );

    unauthTest(
      '"Continue with Discord" button is visible on /baseball/mock-draft when unauthenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /continue with discord/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Discord" button on /baseball/mock-draft is clickable via getByRole',
      async ({ page }) => {
        const discordBtn = page.getByRole('button', {
          name: /continue with discord/i,
        });
        await expect(discordBtn).toBeVisible({ timeout: 15_000 });
        await expect(discordBtn).toBeEnabled();
        await discordBtn.click({ noWaitAfter: true });
      },
    );
  },
);
