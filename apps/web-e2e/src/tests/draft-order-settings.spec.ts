/**
 * E2E Tests: Draft Order & Settings Controls (LS-683)
 *
 * Covers the DraftOrderControl and DraftSettingsControl components on the
 * League Detail Commissioner tab (/baseball/league/:id/commissioner).
 *
 *   - Draft Order: heading, team list, drag handles, Randomize button
 *   - Draft Settings: heading, draft mode selector, draft order select,
 *     selection method, Save Settings button
 *   - Locked state: controls disabled when draft is in progress or completed
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default JWT has id=1 — leagues with owner=1 show the Commissioner tab.
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';

// ── Helpers ────────────────────────────────────────────────────────────────
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ──────────────────────────────────────────────────────────────
function makeLeague(
  draftStatus = 'not-started',
  overrides: Record<string, unknown> = {},
) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test Draft League',
    description: 'Draft order settings test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus,
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    isPublic: false,
    maxBatters: 14,
    maxPitchers: 9,
    tradingEnabled: true,
    waiverEnabled: true,
    startDate: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'DRAFT123',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 3,
    name: 'Gamma Raiders',
    owner: 3,
    leagueId: 1,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 4,
    name: 'Delta Stars',
    owner: 4,
    leagueId: 1,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_DRAFT_TEAM_ORDER = [
  { teamId: 1, teamName: 'Alpha Squad', draftOrder: 1 },
  { teamId: 2, teamName: 'Beta Force', draftOrder: 2 },
  { teamId: 3, teamName: 'Gamma Raiders', draftOrder: 3 },
  { teamId: 4, teamName: 'Delta Stars', draftOrder: 4 },
];

const MOCK_DRAFT_DATA = {
  __typename: 'Draft',
  id: 1,
  leagueId: 1,
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  playerPool: 'all',
  pickTimeSeconds: 60,
  scheduledAt: null,
};

async function setupCommissionerGraphQL(
  page: import('@playwright/test').Page,
  league: ReturnType<typeof makeLeague>,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('getleaguebyid') ||
        postData.includes('"getleague"')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
        });
      } else if (postData.includes('getleagueteams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (postData.includes('getleaguedraft')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueDraft: MOCK_DRAFT_DATA } }),
        });
      } else if (postData.includes('getdraftteamorder')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getDraftTeamOrder: MOCK_DRAFT_TEAM_ORDER },
          }),
        });
      } else if (postData.includes('getuserteamid')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (postData.includes('getpositionsforleague')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
      } else if (postData.includes('getmatchupsforleague')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
        });
      } else if (postData.includes('getcurrentweekforleague')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
        });
      } else if (postData.includes('getuserleagues')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [league] } }),
        });
      } else {
        // Fall through to the baseline _apiIsolation fixture for ambient
        // queries (getUnreadNotificationCount, getUserById, etc.)
        await route.fallback();
      }
    },
  );
}

// ── Accordion helpers ─────────────────────────────────────────────────────

async function expandDraftOrder(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Draft Pick Order',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function expandDraftSettings(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Draft Settings',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Draft Order Control ────────────────────────────────────────────────────

test.describe('Draft Order Control @regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommissionerGraphQL(page, makeLeague('not-started'));
    await page.goto('/baseball/league/1/commissioner');
    await expandDraftOrder(page);
  });

  test('shows Draft Pick Order heading @smoke', async ({ page }) => {
    // Verify the accordion trigger button has aria-expanded="true" (expanded)
    // and the content region is visible
    const trigger = page.getByRole('button', {
      name: 'Draft Pick Order',
      exact: true,
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('region', { name: 'Draft Pick Order' }),
    ).toBeVisible();
  });

  test('shows team names in the draft order list @regression', async ({
    page,
  }) => {
    await expect(page.getByText('Alpha Squad')).toBeVisible();
    await expect(page.getByText('Beta Force')).toBeVisible();
    await expect(page.getByText('Gamma Raiders')).toBeVisible();
    await expect(page.getByText('Delta Stars')).toBeVisible();
  });

  test('shows Randomize button @regression', async ({ page }) => {
    const randomizeBtn = page.getByRole('button', {
      name: /randomize.*draft order|randomize/i,
    });
    await expect(randomizeBtn).toBeVisible();
  });

  test('shows drag handles for each team @regression', async ({ page }) => {
    // Each drag handle has aria-label "Drag to reorder <teamName>"
    await expect(
      page.getByRole('button', { name: /drag to reorder alpha squad/i }),
    ).toBeVisible();
  });

  test('shows drag-to-reorder instruction text @regression', async ({
    page,
  }) => {
    await expect(
      page.getByText(/drag to reorder|randomize the pick order/i).first(),
    ).toBeVisible();
  });
});

// ── Draft Settings Control ─────────────────────────────────────────────────

test.describe('Draft Settings Control @regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommissionerGraphQL(page, makeLeague('not-started'));
    await page.goto('/baseball/league/1/commissioner');
    await expandDraftSettings(page);
  });

  test('shows Draft Settings heading @smoke', async ({ page }) => {
    // Verify the accordion trigger button has aria-expanded="true" (expanded)
    // and the content region is visible
    const trigger = page.getByRole('button', {
      name: 'Draft Settings',
      exact: true,
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('region', { name: 'Draft Settings' }),
    ).toBeVisible();
  });

  test('shows Draft Mode label @regression', async ({ page }) => {
    await expect(page.getByText(/draft mode/i)).toBeVisible();
  });

  test('shows Save Settings button @regression', async ({ page }) => {
    // Save button is rendered in the draft settings card
    const saveBtn = page.getByRole('button', { name: /save.*settings|save/i });
    await expect(saveBtn.first()).toBeVisible();
  });
});

// ── Locked state when draft is in progress ─────────────────────────────────

test.describe('Draft controls locked when draft is in progress @regression', () => {
  test('Randomize button is disabled when draft is in-progress @regression', async ({
    page,
  }) => {
    await setupCommissionerGraphQL(page, makeLeague('in-progress'));
    await page.goto('/baseball/league/1/commissioner');
    await expandDraftOrder(page);

    // When draftStatus is 'in-progress' the controls should be locked/disabled
    await expect(
      page.getByRole('heading', { name: /draft pick order/i }),
    ).toBeVisible();

    const randomizeBtn = page.getByRole('button', {
      name: /randomize.*draft order|randomize/i,
    });
    // Button may not exist or be disabled when draft is in progress
    if (await randomizeBtn.isVisible()) {
      await expect(randomizeBtn).toBeDisabled();
    }
  });

  test('shows locked indicator or text when draft is in-progress @regression', async ({
    page,
  }) => {
    await setupCommissionerGraphQL(page, makeLeague('in-progress'));
    await page.goto('/baseball/league/1/commissioner');
    await expandDraftOrder(page);

    // A lock icon or text should indicate settings cannot be changed
    await expect(
      page
        .getByText(/draft.*in progress|locked|cannot.*change|started/i)
        .first(),
    ).toBeVisible();
  });
});
