/**
 * Commissioner League Settings — E2E Tests (LS-682)
 *
 * Covers LeagueSettingsControl on the commissioner tab:
 *   /baseball/league/:id/commissioner
 *
 *   - "League Settings" heading renders
 *   - Games Per Matchup section and options visible
 *   - SP Starts Per Matchup section visible
 *   - Minimum Career Games section visible
 *   - Save Settings button present
 *   - Reset button present
 *   - Locked state when draftStatus === 'completed'
 *   - Save triggers UpdateLeagueSettings mutation
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    description: 'E2E league settings test',
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
];

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    league?: ReturnType<typeof makeLeague>;
    onUpdateLeagueSettings?: () => unknown;
  } = {},
) {
  const { league = makeLeague(), onUpdateLeagueSettings } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
        });
        return;
      }
      if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
        return;
      }
      if (op === 'GetPositionsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
        return;
      }
      if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
        return;
      }
      if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
        });
        return;
      }
      if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
        });
        return;
      }
      if (op === 'GetLeagueDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getLeagueDraft: { __typename: 'Draft', draftMode: 'live' },
            },
          }),
        });
        return;
      }
      if (op === 'GetDraftTeamOrder') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
        });
        return;
      }
      if (op === 'GetUserLeagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [league] } }),
        });
        return;
      }
      if (op === 'UpdateLeagueSettings') {
        const result = onUpdateLeagueSettings?.() ?? league;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { updateLeagueSettings: result } }),
        });
        return;
      }

      await route.fallback();
    },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Commissioner League Settings @critical', () => {
  test('should display League Settings heading', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('League Settings')).toBeVisible();
  });

  test('should display Games Per Matchup section', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('Games Per Matchup')).toBeVisible();
  });

  test('should display game count options 1 through 7', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    for (const label of [
      '1 game',
      '2 games',
      '3 games',
      '4 games',
      '5 games',
      '6 games',
      '7 games',
    ]) {
      await expect(
        page.getByRole('button', { name: new RegExp(label) }),
      ).toBeVisible();
    }
  });

  test('should display SP Starts Per Matchup section', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('SP Starts Per Matchup')).toBeVisible();
  });

  test('should display Minimum Career Games section', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('Minimum Career Games')).toBeVisible();
  });

  test('should display Save Settings button', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).toBeVisible();
  });

  test('should display Reset button', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  test('should display locked state when draft is completed', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
    });
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByText(
        /League settings are locked while the season is in progress/,
      ),
    ).toBeVisible();
  });

  test('should display configuring text when draft not started', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByText(/Configure matchup settings for the league/),
    ).toBeVisible();
  });

  test('should call UpdateLeagueSettings mutation when Save is clicked', async ({
    page,
  }) => {
    let mutationCalled = false;
    await setupGraphQL(page, {
      onUpdateLeagueSettings: () => {
        mutationCalled = true;
        return makeLeague();
      },
    });
    await page.goto('/baseball/league/1/commissioner');

    // Change a setting to enable the save button (games per matchup)
    await page
      .getByRole('button', { name: /Games per matchup: 7 games/ })
      .click();
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);
  });
});
