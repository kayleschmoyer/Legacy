/**
 * Pending Waiver Claims E2E Tests (LS-611)
 *
 * Covers: pending claims list, cancel claim, empty state (hidden), error state,
 * footer summary text, FAAB bid display, drop player display.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 *
 * The PendingWaiverClaims component renders on the roster tab
 * (/baseball/league/1/roster) when the user has a team and is viewing the
 * current week (rosterViewWeek === null, which is the default).
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

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

// ── Constants ────────────────────────────────────────────────────────────────

const ROSTER_URL = '/baseball/league/1/roster';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'Test league',
  owner: 1,
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
  inviteCode: 'TEST1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'My Team',
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
    name: 'Rival Team',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 80,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

function mockClaim(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'WaiverClaim',
    id: 1,
    teamId: 1,
    playerId: 101,
    playerName: 'John Doe',
    dropPlayerId: null,
    dropPlayerName: null,
    faabBid: null,
    status: 'pending',
    claimType: 'waiver',
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface SetupOptions {
  claims?: ReturnType<typeof mockClaim>[];
  errorClaims?: boolean;
  onCancelClaim?: (vars: { claimId: number }) => void;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { claims = [], errorClaims = false, onCancelClaim } = opts;

  let currentClaims = [...claims];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
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
    } else if (
      postData.includes('getteamwaiverclaims') ||
      postData.includes('teamwaiverclaims')
    ) {
      if (errorClaims) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load waiver claims' }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { teamWaiverClaims: currentClaims },
          }),
        });
      }
    } else if (postData.includes('cancelwaiverclaim')) {
      let claimId: number | undefined;
      try {
        const raw = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { claimId?: number };
        };
        claimId = raw.variables?.claimId;
      } catch {
        // ignore parse error
      }
      if (claimId !== undefined) {
        onCancelClaim?.({ claimId });
        currentClaims = currentClaims.filter((c) => c.id !== claimId);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { cancelWaiverClaim: true } }),
      });
    } else if (
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (
      postData.includes('getpendingtradeoffers') ||
      postData.includes('pendingtradeoffers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (
      postData.includes('getcurrentweekmatchup') ||
      postData.includes('getcurrentweekmatchupforleague') ||
      postData.includes('getcurrentweekforleague') ||
      postData.includes('currentweek')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 1 } }),
      });
    } else if (postData.includes('getmatchupsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
      });
    } else if (
      postData.includes('getmatchupbyid') ||
      postData.includes('getcurrentmatchup')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentMatchup: null } }),
      });
    } else if (postData.includes('getmatchupplayers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (postData.includes('getleaguedraft')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leagueDraft: {
              __typename: 'Draft',
              id: 1,
              status: 'not-started',
              currentPick: null,
              totalRounds: 25,
              totalPicks: 100,
              draftType: 'snake',
              secondsPerPick: 90,
              scheduledFor: null,
            },
          },
        }),
      });
    } else if (
      postData.includes('getdraftteamorder') ||
      postData.includes('draftteamorder')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftTeamOrder: [] } }),
      });
    } else if (postData.includes('getuserleagues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (
      postData.includes('getleaguestandings') ||
      postData.includes('leaguestandings')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      postData.includes('getleaguescoring') ||
      postData.includes('leaguescoringprofile')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else {
      // default mock — pass unmatched queries to the next route handler
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests: Pending Waiver Claims ──────────────────────────────────────────────

test.describe('Pending Waiver Claims — component hidden when empty @regression', () => {
  test('component does not render when teamWaiverClaims returns empty array', async ({
    page,
  }) => {
    await setupGraphQL(page, { claims: [] });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Pending Waiver Claims')).not.toBeVisible();
  });
});

test.describe('Pending Waiver Claims — list display @critical', () => {
  test('header reads "Pending Waiver Claims"', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [mockClaim()],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Pending Waiver Claims')).toBeVisible();
  });

  test('displays player name for a pending claim', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'John Doe' })],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('John Doe')).toBeVisible();
  });

  test('shows fallback "Player #N" when playerName is null', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: null, playerId: 42 })],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Player #42')).toBeVisible();
  });

  test('renders multiple claims', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({ id: 1, playerName: 'Player One' }),
        mockClaim({ id: 2, playerName: 'Player Two' }),
        mockClaim({ id: 3, playerName: 'Player Three' }),
      ],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Player One')).toBeVisible();
    await expect(page.getByText('Player Two')).toBeVisible();
    await expect(page.getByText('Player Three')).toBeVisible();
  });

  test('footer shows singular "1 pending claim — processed hourly"', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim()],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/1 pending claim — processed hourly/i),
    ).toBeVisible();
  });

  test('footer shows plural "N pending claims — processed hourly"', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({ id: 1 }),
        mockClaim({ id: 2, playerName: 'Other Player' }),
      ],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/2 pending claims — processed hourly/i),
    ).toBeVisible();
  });
});

test.describe('Pending Waiver Claims — cancel button @critical', () => {
  test('each claim has a cancel button with correct aria-label', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'John Doe' })],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', {
        name: /cancel waiver claim for John Doe/i,
      }),
    ).toBeVisible();
  });

  test('clicking cancel triggers CancelWaiverClaim mutation', async ({
    page,
  }) => {
    const cancelledIds: number[] = [];
    await setupGraphQL(page, {
      claims: [mockClaim({ id: 7, playerName: 'Jane Smith' })],
      onCancelClaim: ({ claimId }) => {
        cancelledIds.push(claimId);
      },
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await page
      .getByRole('button', { name: /cancel waiver claim for Jane Smith/i })
      .click();

    await expect.poll(() => cancelledIds, { timeout: 10000 }).toContain(7);
  });
});

test.describe('Pending Waiver Claims — special claim attributes @regression', () => {
  test('shows FAAB bid amount when faabBid > 0', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'Big Spender', faabBid: 25 })],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('$25 FAAB')).toBeVisible();
  });

  test('does not show FAAB label when faabBid is null', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'Free Claimer', faabBid: null })],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText(/FAAB/)).not.toBeVisible();
  });

  test('shows drop player name when dropPlayerId is set', async ({ page }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({
          playerName: 'New Guy',
          dropPlayerId: 55,
          dropPlayerName: 'Old Guy',
        }),
      ],
    });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText(/Drop:/i)).toBeVisible();
    await expect(page.getByText('Old Guy')).toBeVisible();
  });
});

test.describe('Pending Waiver Claims — error state @regression', () => {
  test('displays error message when query fails', async ({ page }) => {
    await setupGraphQL(page, { errorClaims: true });
    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    // V2 renders the failure message in two places (the alert role for
    // assistive tech, plus the visible error text in the main content
    // region). Target the alert region to avoid the strict-mode collision.
    await expect(
      page.getByRole('alert').getByText('Failed to load waiver claims'),
    ).toBeVisible();
  });
});
