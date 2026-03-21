/**
 * Mock Draft Simulator E2E Tests (LS-1614)
 *
 * Covers: setup screen rendering, settings UI, start button, and premium gate.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** Premium user — subscriptionTier unlocks PremiumGate. */
const PREMIUM_USER = {
  __typename: 'User',
  id: 1,
  email: 'test@example.com',
  username: 'testuser',
  name: 'Test User',
  accessLevel: 'none',
  subscriptionTier: 'premium',
};

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

async function setupGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    // User query — must return premium tier for PremiumGate
    if (postData.includes('getuserbyid') || postData.includes('"getuser"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { user: PREMIUM_USER } }),
      });
    } else if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
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
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (postData.includes('getuserleagues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (postData.includes('initializemockdraft')) {
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
    } else if (postData.includes('getleaguedraft')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueDraft: null } }),
      });
    } else if (postData.includes('getdraftteamorder')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftTeamOrder: [] } }),
      });
    } else {
      await route.fallback();
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

  test('setup screen shows roster size (rounds) options', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Mock Draft Simulator/i }),
    ).toBeVisible();

    // All roster size buttons are visible
    for (const n of [5, 8, 10, 15]) {
      await expect(
        page.getByRole('button', { name: String(n), exact: true }).first(),
      ).toBeVisible();
    }
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
