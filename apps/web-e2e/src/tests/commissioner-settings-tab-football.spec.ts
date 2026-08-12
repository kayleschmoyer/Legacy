/**
 * Commissioner Settings Tab — Football League Detail E2E (LS-5416)
 *
 * Epic LS-5268 "Football League Detail" journey:
 *   As a commissioner, I want to open the Commissioner Settings tab so that
 *   I can configure league rules.
 *   -> Test: as a commissioner identity, open the Commissioner Settings tab,
 *      assert settings controls render, change a setting, save, and assert
 *      the saved value persists on reload; assert a non-commissioner does
 *      not see edit controls.
 *
 * Covers: /football/league/:id/commissioner
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  enableFootball,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ─────────────────────────────────────────────────────────────────

function makeFootballLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test Football League',
    description: 'LS-5416 commissioner settings tab test league',
    owner: 1,
    sport: 'football',
    defensiveFormat: 'dst',
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
];

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeFootballLeague>;
  onUpdateLeagueSettings?: (variables: Record<string, unknown>) => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { league = makeFootballLeague(), onUpdateLeagueSettings } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: Record<string, unknown>;
      };
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
      if (op === 'GetLeagueScoringProfile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueScoringProfile: null } }),
        });
        return;
      }
      if (op === 'UpdateLeagueSettings') {
        const result = onUpdateLeagueSettings?.(body.variables ?? {}) ?? league;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { updateLeagueSettings: result } }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click the "League Settings" accordion header so its content is visible. */
async function expandLeagueSettings(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'League Settings',
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Commissioner Settings Tab — Football @critical', () => {
  test('commissioner can navigate from Overview to the Commissioner tab via tab click @smoke', async ({
    page,
  }) => {
    await enableFootball(page);
    await setupGraphQL(page);
    await page.goto('/football/league/1/overview');

    const tablist = page.getByRole('tablist', { name: 'League sections' });
    await tablist.getByRole('tab', { name: 'Commissioner' }).click();

    // LeagueDetailPageV2's tab-click handler hardcodes the `/baseball/`
    // URL prefix regardless of the page's actual sport (LS-9257), and uses
    // the internal tab id ("commish") rather than the "commissioner" route
    // alias — so the URL check here only asserts the tab route segment and
    // rendered content, not the sport prefix.
    await expect(page).toHaveURL(/\/league\/1\/commish/);
    await expect(page.getByText('League Settings')).toBeVisible();
  });

  test('settings controls render for a football commissioner', async ({
    page,
  }) => {
    await enableFootball(page);
    await setupGraphQL(page);
    await page.goto('/football/league/1/commissioner');
    await expandLeagueSettings(page);

    await expect(page.getByLabel('Games per matchup')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).toBeVisible();
  });

  test('changing a setting and saving calls UpdateLeagueSettings with the new value', async ({
    page,
  }) => {
    let savedVariables: Record<string, unknown> | undefined;
    await enableFootball(page);
    await setupGraphQL(page, {
      onUpdateLeagueSettings: (variables) => {
        savedVariables = variables;
        return makeFootballLeague({ gamesPerMatchup: 7 });
      },
    });
    await page.goto('/football/league/1/commissioner');
    await expandLeagueSettings(page);

    await page.getByLabel('Games per matchup').fill('7');
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect.poll(() => savedVariables).toBeDefined();
    expect(savedVariables?.input).toMatchObject({
      gamesPerMatchup: 7,
    });
  });

  test('saved value persists after a reload', async ({ page }) => {
    await enableFootball(page);
    // Simulate the saved state already applied server-side — a reload
    // re-fetches GetLeagueById and should reflect the new value.
    await setupGraphQL(page, {
      league: makeFootballLeague({ gamesPerMatchup: 7 }),
    });
    await page.goto('/football/league/1/commissioner');
    await expandLeagueSettings(page);

    await expect(page.getByLabel('Games per matchup')).toHaveValue('7');

    await page.reload();
    await expandLeagueSettings(page);

    await expect(page.getByLabel('Games per matchup')).toHaveValue('7');
  });

  test('a non-commissioner is redirected away from the Commissioner tab and does not see edit controls', async ({
    page,
  }) => {
    await enableFootball(page);
    await setupGraphQL(page, {
      league: makeFootballLeague({ owner: 999 }),
    });
    await page.goto('/football/league/1/commissioner');

    // LeagueDetailPageV2 redirects tab === 'commish' back to overview when
    // the viewer is not the league owner. The redirect goes through the
    // same setTab() helper that hardcodes /baseball/ (LS-9257), so this
    // check is sport-agnostic on the same route segment.
    await expect(page).toHaveURL(/\/league\/1\/overview/);
    await expect(page.getByText('League Settings')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).not.toBeVisible();
  });
});
