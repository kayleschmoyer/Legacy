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
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ────────────────────────────────────────────────────────────────

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
    pitcherStartsPerMatchup: 1,
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
      const op = extractOperationName(route);

      // GetUserById (premium) is served by the shared premium-by-default
      // baseline (LS-8058); the ad-hoc premium mock was removed.
      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (op === 'GetLeagueDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueDraft: MOCK_DRAFT_DATA } }),
        });
      } else if (op === 'GetDraftTeamOrder') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getDraftTeamOrder: MOCK_DRAFT_TEAM_ORDER },
          }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (op === 'GetPositionsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
        });
      } else if (op === 'GetUserLeagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [league] } }),
        });
      } else {
        // Fall through to the baseline _apiIsolation fixture for ambient
        // queries (getUnreadNotificationCount, getUserById, etc.)
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ── Accordion helpers ─────────────────────────────────────────────────────

// LS-4171: The "Draft Pick Order" accordion section was removed from the V2
// commissioner tab; only "Draft Settings" remains. Tests targeting Draft Pick
// Order (heading, team list, Randomize button, drag handles, locked state)
// were removed in this change.
async function expandDraftSettings(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Draft Settings',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

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

// ── Premium gate — free user ───────────────────────────────────────────────────

async function setupFreeUserGraphQL(
  page: import('@playwright/test').Page,
  league: ReturnType<typeof makeLeague>,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      // Free-tier entitlement is pinned via useTier(page, 'free') below
      // (LS-8058) — the GetUserById override is consolidated into the shared
      // fixture so the premium gate fires for this commissioner free user.
      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (op === 'GetLeagueDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueDraft: MOCK_DRAFT_DATA } }),
        });
      } else if (op === 'GetDraftTeamOrder') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getDraftTeamOrder: MOCK_DRAFT_TEAM_ORDER },
          }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (op === 'GetPositionsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
        });
      } else if (op === 'GetUserLeagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [league] } }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );
  // Pin the current user to free via the shared entitlement fixture (LS-8058)
  // so the commissioner page's premium gate fires. Registered after the route
  // above so its GetUserById handler runs first (Playwright LIFO).
  await useTier(page, 'free');
}

test.describe('Draft Settings Control — free user premium gate @regression', () => {
  test('shows premium gate for free user on the commissioner page @regression', async ({
    page,
  }) => {
    await setupFreeUserGraphQL(page, makeLeague('not-started'));
    await page.goto('/baseball/league/1/commissioner');

    // The league's creator (owner 1 = the signed-in user) keeps access to
    // their league after downgrading (LS-10427), so there is no page-level
    // gate here. Draft settings are a NEW premium decision, so the section
    // itself is locked inline by the shared-components PremiumGate card.
    await expandDraftSettings(page);
    const region = page.getByRole('region', { name: 'Draft Settings' });
    await expect(region.getByTestId('premium-feature-gate')).toBeVisible();
    await expect(
      region.getByText(/available with premium leagues/i),
    ).toBeVisible();
  });
});
