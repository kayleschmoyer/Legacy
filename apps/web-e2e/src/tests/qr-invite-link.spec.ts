/**
 * QR Invite Link — Mocked E2E Tests (LS-1615)
 *
 * Covers the Invite Friends card on the League Overview page:
 *   - Commissioner sees invite code and share options
 *   - Share Link, Manual Code, and QR Code sections are visible
 *   - Non-commissioner (league.owner != user id) sees no invite code
 *
 * All GraphQL queries are mocked — no live backend required.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';

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

// ── Mock Data ────────────────────────────────────────────────────────────────

const COMMISSIONER_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  owner: 1,
  description: 'Test',
  maxRosterSize: 25,
  draftStatus: 'not-started',
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
  inviteCode: 'INVITE123',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

/** League where the current user (id=1) is NOT the commissioner. */
const NON_COMMISSIONER_LEAGUE = {
  ...COMMISSIONER_LEAGUE,
  owner: 2,
  inviteCode: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Team Alpha',
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
    name: 'Team Beta',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

// ── GraphQL Route Setup ──────────────────────────────────────────────────────

async function setupGraphQL(
  page: import('@playwright/test').Page,
  league:
    | typeof COMMISSIONER_LEAGUE
    | typeof NON_COMMISSIONER_LEAGUE = COMMISSIONER_LEAGUE,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getleaguebyid' || op === 'getleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
    } else if (op === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('QR Invite Link @critical', () => {
  test('invite code is displayed for commissioner', async ({ page }) => {
    await setupGraphQL(page, COMMISSIONER_LEAGUE);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('domcontentloaded');

    // "Invite Friends" card heading is visible
    await expect(page.getByText('Invite Friends')).toBeVisible({
      timeout: 15_000,
    });

    // Manual Code section shows the invite code
    await expect(page.getByText('Manual Code')).toBeVisible();
    await expect(page.getByText('INVITE123', { exact: true })).toBeVisible();

    // Share Link section shows a URL containing the join path
    await expect(page.getByText('Share Link')).toBeVisible();
    const urlBox = page
      .locator('text=/\\/baseball\\/league\\/join\\//')
      .first();
    await expect(urlBox).toBeVisible({ timeout: 10_000 });
    const displayedUrl = (await urlBox.textContent()) ?? '';
    expect(displayedUrl).toContain('/baseball/league/join/INVITE123');
  });

  test('invite link section shows share options', async ({ page }) => {
    await setupGraphQL(page, COMMISSIONER_LEAGUE);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Invite Friends')).toBeVisible({
      timeout: 15_000,
    });

    // Share Link section with copy button
    await expect(page.getByText('Share Link')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /copy invite link/i }),
    ).toBeVisible();

    // Manual Code section with copy button
    await expect(page.getByText('Manual Code')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /copy invite code/i }),
    ).toBeVisible();

    // QR Code section with show/hide toggle
    await expect(page.getByText('QR Code', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /show qr code/i }),
    ).toBeVisible();

    // Header quick-share invite button
    await expect(
      page.getByRole('button', { name: /share invite link/i }),
    ).toBeVisible();
  });

  test('non-commissioner does not see invite controls', async ({ page }) => {
    await setupGraphQL(page, NON_COMMISSIONER_LEAGUE);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('domcontentloaded');

    // The Invite Friends card still renders, but without a real invite code
    // the code display shows "..." and the invite URL shows "Loading..."
    await expect(page.getByText('Invite Friends')).toBeVisible({
      timeout: 15_000,
    });

    // Invite code should NOT be visible (null invite code renders "...")
    await expect(page.getByText('INVITE123')).not.toBeVisible();

    // The share link URL should not contain a join path (inviteCode is null)
    const urlBox = page
      .locator('text=/\\/baseball\\/league\\/join\\//')
      .first();
    await expect(urlBox).not.toBeVisible({ timeout: 5_000 });
  });
});
