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

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8456 / ADR-0015/0016): all locators live on
// `waiversPage` — this spec is selector-free. The default `test` from
// `../fixtures/pages` is the auth-enhanced isolated test with page objects
// injected (identical isolation to the previous `../fixtures/auth-enhanced`
// import, now with `{ waiversPage, … }`). GraphQL `page.route` mocks stay here.

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;

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
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getleaguebyid' || op === 'getleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
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
    } else if (op === 'getteamwaiverclaims' || op === 'teamwaiverclaims') {
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
    } else if (op === 'cancelwaiverclaim') {
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
    } else if (op === 'getteammembers' || op === 'teammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (op === 'getpendingtradeoffers' || op === 'pendingtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (
      op === 'getcurrentweekmatchup' ||
      op === 'getcurrentweekmatchupforleague' ||
      op === 'getcurrentweekforleague' ||
      op === 'currentweek'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 1 } }),
      });
    } else if (op === 'getmatchupsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
      });
    } else if (op === 'getmatchupbyid' || op === 'getcurrentmatchup') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentMatchup: null } }),
      });
    } else if (op === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (op === 'getleaguedraft') {
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
    } else if (op === 'getdraftteamorder' || op === 'draftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftTeamOrder: [] } }),
      });
    } else if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (op === 'getleagueactivity' || op === 'leagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (op === 'getleaguechatmessages' || op === 'getleaguemessages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (op === 'getleaguestandings' || op === 'leaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      op === 'getleaguescoringprofile' ||
      op === 'leaguescoringprofile'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (op === 'getleagueannouncements') {
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
    waiversPage,
  }) => {
    await setupGraphQL(page, { claims: [] });
    await waiversPage.goto(LEAGUE_ID);

    await waiversPage.header.expectHidden();
  });
});

test.describe('Pending Waiver Claims — list display @critical', () => {
  // At/below the Tamagui `md` breakpoint (both mobile Playwright projects)
  // the panel renders in `compact` mode (LS-9355/LS-9408): a condensed pill
  // with none of the full-panel surface below. Each test here asserts the
  // surface the viewport actually renders, never a weakened either/or check.

  test('header reads "Pending Waiver Claims" on desktop; compact pill shows the count on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim()],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.header.expectHidden();
    } else {
      await waiversPage.header.expectVisible();
    }
  });

  test('displays player name for a pending claim on desktop; compact pill omits per-claim detail on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'John Doe' })],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.playerName('John Doe').expectHidden();
    } else {
      await waiversPage.playerName('John Doe').expectVisible();
    }
  });

  test('shows fallback "Player #N" when playerName is null on desktop; compact pill omits it on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: null, playerId: 42 })],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.playerName('Player #42').expectHidden();
    } else {
      await waiversPage.playerName('Player #42').expectVisible();
    }
  });

  test('renders multiple claims on desktop; compact pill shows the pluralized count on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({ id: 1, playerName: 'Player One' }),
        mockClaim({ id: 2, playerName: 'Player Two' }),
        mockClaim({ id: 3, playerName: 'Player Three' }),
      ],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(3).expectVisible();
    } else {
      await waiversPage.playerName('Player One').expectVisible();
      await waiversPage.playerName('Player Two').expectVisible();
      await waiversPage.playerName('Player Three').expectVisible();
    }
  });

  test('footer shows singular "1 pending claim — processed daily at <h>am ET" on desktop; compact pill shows singular copy on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim()],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
    } else {
      await waiversPage.footerSummary(1).expectVisible();
    }
  });

  test('footer shows plural "N pending claims — processed daily at <h>am ET" on desktop; compact pill shows plural copy on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({ id: 1 }),
        mockClaim({ id: 2, playerName: 'Other Player' }),
      ],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(2).expectVisible();
    } else {
      await waiversPage.footerSummary(2).expectVisible();
    }
  });
});

test.describe('Pending Waiver Claims — cancel button @critical', () => {
  test('each claim has a cancel button with correct aria-label on desktop; the compact surface offers no cancel action on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'John Doe' })],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.cancelButtonFor('John Doe').expectHidden();
    } else {
      await waiversPage.cancelButtonFor('John Doe').expectVisible();
    }
  });

  test('clicking cancel triggers CancelWaiverClaim mutation on desktop; the compact surface offers no cancel action on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    const cancelledIds: number[] = [];
    await setupGraphQL(page, {
      claims: [mockClaim({ id: 7, playerName: 'Jane Smith' })],
      onCancelClaim: ({ claimId }) => {
        cancelledIds.push(claimId);
      },
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.cancelButtonFor('Jane Smith').expectHidden();
      return;
    }

    await waiversPage.cancelClaim('Jane Smith');

    await expect.poll(() => cancelledIds, { timeout: 10000 }).toContain(7);
  });
});

test.describe('Pending Waiver Claims — special claim attributes @regression', () => {
  test('shows FAAB bid amount when faabBid > 0 on desktop; compact pill omits it on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'Big Spender', faabBid: 25 })],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.faabBadge(25).expectHidden();
    } else {
      await waiversPage.faabBadge(25).expectVisible();
    }
  });

  test('does not show FAAB label when faabBid is null', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [mockClaim({ playerName: 'Free Claimer', faabBid: null })],
    });
    await waiversPage.goto(LEAGUE_ID);

    await waiversPage.faabLabel.expectHidden();
  });

  test('shows drop player name when dropPlayerId is set on desktop; compact pill omits it on narrow viewports', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, {
      claims: [
        mockClaim({
          playerName: 'New Guy',
          dropPlayerId: 55,
          dropPlayerName: 'Old Guy',
        }),
      ],
    });
    await waiversPage.goto(LEAGUE_ID);

    if (waiversPage.isCompactSurface()) {
      await waiversPage.compactSummary(1).expectVisible();
      await waiversPage.dropLabel.expectHidden();
      await waiversPage.playerName('Old Guy').expectHidden();
    } else {
      await waiversPage.dropLabel.expectVisible();
      await waiversPage.playerName('Old Guy').expectVisible();
    }
  });
});

test.describe('Pending Waiver Claims — error state @regression', () => {
  test('displays error message when query fails', async ({
    page,
    waiversPage,
  }) => {
    await setupGraphQL(page, { errorClaims: true });
    await waiversPage.goto(LEAGUE_ID);

    // V2 renders the failure message in two places (the alert role for
    // assistive tech, plus the visible error text in the main content
    // region). Target the alert region to avoid the strict-mode collision.
    await waiversPage.loadError.expectVisible();
  });
});
