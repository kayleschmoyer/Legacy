/**
 * Season Awards Control E2E Tests (LS-689)
 *
 * Covers: "Season Awards" accordion panel on the commissioner tab,
 * award types displayed, season picker, existing awards, empty state,
 * and delete button visibility.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Route: /baseball/league/1/commissioner (Season Awards accordion section)
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

const COMMISSIONER_URL = '/baseball/league/1/commissioner';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Awards League',
  description: '',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
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
  inviteCode: 'AWARD123',
  userMembership: { teamId: 1, permissionLevel: 'owner' },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  spStartsPerMatchup: null,
  gamesPerMatchup: 7,
  totalMatchups: 12,
  playoffTeams: 4,
  playoffMatchups: 3,
  salaryCap: null,
  salaryCapEnabled: false,
  eraFilter: null,
  hofOnly: false,
  customEraStartYear: null,
  customEraEndYear: null,
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
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
];

function mockAward(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'LeagueSeasonAward',
    id: 1,
    leagueId: 1,
    season: 2023,
    playerId: 101,
    playerFirstName: 'Babe',
    playerLastName: 'Ruth',
    awardType: 'mvp',
    notes: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface SetupOptions {
  awards?: ReturnType<typeof mockAward>[];
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { awards = [] } = opts;

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
      postData.includes('getleagueseasonawards') ||
      postData.includes('leagueseasonawards')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueSeasonAwards: awards } }),
      });
    } else if (postData.includes('getawardvotingperiod')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { awardVotingPeriod: null } }),
      });
    } else if (postData.includes('getawardvoteresults')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { awardVoteResults: [] } }),
      });
    } else if (
      postData.includes('getplayerswithstats') ||
      postData.includes('playerswithstats')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { players: [] } }),
      });
    } else if (
      postData.includes('upsertleagueseasonaward') ||
      postData.includes('deleteleagueseasonaward')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            upsertLeagueSeasonAward: true,
            deleteLeagueSeasonAward: true,
          },
        }),
      });
    } else if (
      postData.includes('getleaguedraft') ||
      postData.includes('leaguedraft')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: 1,
              status: 'completed',
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
        body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
      });
    } else if (postData.includes('getuserleagues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      postData.includes('getcurrentweekmatchup') ||
      postData.includes('getcurrentweekforleague') ||
      postData.includes('currentweek')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
      });
    } else if (
      postData.includes('getmatchupsforleague') ||
      postData.includes('getmatchupbyid') ||
      postData.includes('getcurrentmatchup') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupsForLeague: [],
            getMatchupById: null,
            getCurrentMatchup: null,
            getMatchupPlayers: [],
          },
        }),
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
    } else if (postData.includes('getteamwaiverclaims')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (postData.includes('getpendingtradeoffers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// Helper: expand the Season Awards accordion section
async function expandSeasonAwards(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Season Awards',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Tests: Accordion ──────────────────────────────────────────────────────────

test.describe('Season Awards — accordion panel @regression', () => {
  test('"Season Awards" accordion toggle is visible on commissioner tab', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: 'Season Awards', exact: true }),
    ).toBeVisible();
  });

  test('clicking the toggle expands the Season Awards panel', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');

    await expandSeasonAwards(page);

    // Verify the section content is now visible (heading inside the panel).
    // Use .nth(1) — the accordion toggle <h4> and the content <h4> both match.
    await expect(
      page.getByRole('heading', { name: /season awards/i }).nth(1),
    ).toBeVisible();
  });

  test('"Season Awards" heading is visible inside the panel', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');

    await expandSeasonAwards(page);

    // Tamagui H4 inside Card renders as <p>, not <h4> — use getByText
    await expect(
      page.getByText('Season Awards', { exact: true }).first(),
    ).toBeVisible();
  });
});

// ── Tests: Award types ────────────────────────────────────────────────────────

test.describe('Season Awards — award type rows @regression', () => {
  test('displays "Most Valuable Player" award row', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(
      page.getByText('Most Valuable Player', { exact: true }),
    ).toBeVisible();
  });

  test('displays "Cy Young Award" award row', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(
      page.getByText('Cy Young Award', { exact: true }),
    ).toBeVisible();
  });

  test('displays "Rookie of the Year" award row', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(
      page.getByText('Rookie of the Year', { exact: true }),
    ).toBeVisible();
  });

  test('displays "Gold Glove" award row', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(page.getByText('Gold Glove', { exact: true })).toBeVisible();
  });

  test('displays "Silver Slugger" award row', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(
      page.getByText('Silver Slugger', { exact: true }),
    ).toBeVisible();
  });
});

// ── Tests: Season picker ──────────────────────────────────────────────────────

test.describe('Season Awards — season picker @regression', () => {
  test('season selector is visible', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(
      page.getByRole('combobox', { name: /select season/i }),
    ).toBeVisible();
  });
});

// ── Tests: Existing awards ────────────────────────────────────────────────────

test.describe('Season Awards — existing award display @regression', () => {
  test('shows the player name for an assigned MVP award', async ({ page }) => {
    await setupGraphQL(page, {
      awards: [
        mockAward({
          awardType: 'mvp',
          playerFirstName: 'Babe',
          playerLastName: 'Ruth',
        }),
      ],
    });
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    await expect(page.getByText('Babe Ruth')).toBeVisible();
  });

  test('shows delete button for an assigned award', async ({ page }) => {
    await setupGraphQL(page, {
      awards: [mockAward({ awardType: 'mvp' })],
    });
    await page.goto(COMMISSIONER_URL);
    await page.waitForLoadState('load');
    await expandSeasonAwards(page);

    // Delete/remove button should be visible for assigned award (Trash2 icon button)
    // The aria-label is "Remove <award label>" e.g. "Remove Most Valuable Player"
    await expect(
      page.getByRole('button', { name: /remove most valuable player/i }),
    ).toBeVisible();
  });
});
