/**
 * Football League Detail — Standings Tab E2E Tests (LS-5422)
 *
 * Covers the Standings tab user journey for the football-league-detail page
 * (/football/league/:id/standings), per the parent QA epic LS-5268: navigate
 * to the league detail route, open the Standings tab, and assert a standings
 * table renders with rank/team/W-L/points columns ordered by standing —
 * including division grouping when the league has divisions.
 *
 * All GraphQL queries are mocked (route.fulfill only — no route.continue()),
 * so this spec runs without a live backend.
 *
 * "Click team to view roster" (LS-9255) is covered below — clicking a team
 * row navigates to the football team route `/football/teams/:teamId`.
 *
 * The week selector for historical ("as of Week N") standings is covered
 * below (LS-6341).
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

// ── Mock Data ────────────────────────────────────────────────────────────────

function makeFootballLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Gridiron Gauntlet',
    description: 'LS-5422 football standings-tab E2E league',
    owner: 1,
    sport: 'football',
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: 1,
    numberOfTeams: 3,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    isPublic: false,
    maxBatters: 14,
    maxPitchers: 9,
    tradingEnabled: true,
    waiverEnabled: false,
    startDate: null,
    waiverType: 'standard',
    playoffEnabled: false,
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Northside Ironclads',
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
    name: 'Southgate Marauders',
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
    name: 'Eastway Blitz',
    owner: 3,
    leagueId: 1,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** Standings intentionally NOT in win-order — proves the table (re)sorts them. */
const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Northside Ironclads',
    wins: 4,
    losses: 9,
    ties: 0,
    winPercentage: 0.308,
    pointsFor: 310,
    pointsAgainst: 420,
    divisionId: null,
    divisionName: null,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: 'Southgate Marauders',
    wins: 10,
    losses: 3,
    ties: 0,
    winPercentage: 0.769,
    pointsFor: 480,
    pointsAgainst: 340,
    divisionId: null,
    divisionName: null,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 3,
    teamName: 'Eastway Blitz',
    wins: 7,
    losses: 6,
    ties: 0,
    winPercentage: 0.538,
    pointsFor: 400,
    pointsAgainst: 380,
    divisionId: null,
    divisionName: null,
    avatarUrl: null,
  },
];

/** Standings split across two divisions, each internally win-ordered. */
const MOCK_DIVISION_STANDINGS = MOCK_STANDINGS.map((s, i) => ({
  ...s,
  divisionId: i === 1 ? 2 : 1,
  divisionName: i === 1 ? 'AFC East' : 'NFC West',
}));

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Quarterback', abbrev: 'QB' },
  { __typename: 'LeaguePosition', id: 2, name: 'Running Back', abbrev: 'RB' },
];

// ── GraphQL Routing ──────────────────────────────────────────────────────────

interface MockOverrides {
  league?: Record<string, unknown>;
  standings?: typeof MOCK_STANDINGS;
  currentWeek?: number | null;
}

async function mockFootballStandings(
  page: import('@playwright/test').Page,
  overrides: MockOverrides = {},
) {
  const league = makeFootballLeague(overrides.league);
  const standings = overrides.standings ?? MOCK_STANDINGS;
  const currentWeek =
    overrides.currentWeek === undefined ? 5 : overrides.currentWeek;

  await createGraphQLRouter(page, {
    getleaguebyid: (route) => fulfillJson(route, { data: { league } }),
    getleague: (route) => fulfillJson(route, { data: { league } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getleaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: standings } }),
    leaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: standings } }),
    getcurrentweekforleague: (route) =>
      fulfillJson(route, { data: { getCurrentWeekForLeague: currentWeek } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: MOCK_POSITIONS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [league] } }),
    getusers: (route) => fulfillJson(route, { data: { users: [] } }),
    // Backs the football team detail route (LS-9255) once a Standings row is
    // clicked — FootballTeamDetailPage queries the team by id and its roster.
    getteambyid: (route, request) => {
      const teamId = Number(request.variables['teamId']);
      const team = MOCK_TEAMS.find((t) => t.id === teamId) ?? MOCK_TEAMS[0];
      return fulfillJson(route, {
        data: { team: { ...team, managerId: team.owner } },
      });
    },
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: [] } }),
    getviewermembership: (route) =>
      fulfillJson(route, {
        data: {
          viewerMembership: {
            __typename: 'LeagueMember',
            leagueId: 1,
            userId: 1,
            teamId: 1,
            permissionLevel: 'general_manager',
            username: 'testuser',
          },
        },
      }),
  });
}

// ── Standings Tab — navigation ────────────────────────────────────────────────

test.describe('Football Standings Tab — navigation @smoke', () => {
  test('navigates to the standings tab on the football league detail page', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page);
    await standingsPage.goto(1, 'football');

    await expect(page).toHaveURL('/football/league/1/standings');
    await standingsPage.expectNoAppError();
  });

  // LS-9255: clicking a team on a football league's Standings tab used to
  // navigate to /baseball/teams/:id (hardcoded for every sport) — assert it
  // now stays under the football team route and that route actually renders.
  test('clicking a team navigates to the football team detail route', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    await standingsPage.team('Northside Ironclads').tap();

    await expect(page).toHaveURL('/football/teams/1');
    await standingsPage.expectNoAppError();
    await expect(page.getByText('Northside Ironclads')).toBeVisible();
  });
});

// ── Standings Tab — data rendering ────────────────────────────────────────────

test.describe('Football Standings Tab — data rendering @regression', () => {
  /**
   * Pinned to the desktop viewport so these assertions cover the single
   * full-width table (≥980). Below that every column is still rendered, in a
   * horizontally scrolling pane beside the pinned Team column (LS-10717), so
   * off-screen columns are not "visible" at 375px. Pinned rather than skipped
   * so the column assertions still run under the mobile projects (LS-9712);
   * the sibling tests below keep their phone-width coverage.
   */
  test.describe('desktop column set', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('renders a standings table with rank, team, W/L/T, and points columns', async ({
      page,
      leaguePage,
      standingsPage,
    }) => {
      await mockFootballStandings(page);
      await standingsPage.goto(1, 'football');
      await standingsPage.expectNoAppError();

      // Every team from the mocked standings renders.
      await standingsPage.team('Northside Ironclads').expectVisible();
      await standingsPage.team('Southgate Marauders').expectVisible();
      await standingsPage.team('Eastway Blitz').expectVisible();

      // Rank, W, L, T, and points columns render. Anchored regexes avoid
      // substring collisions (e.g. "W" matching "Win%").
      await leaguePage.standingsColumnHeader(/^#$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^Team$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^W$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^L$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^T$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^PF$/).expectVisible();
      await leaguePage.standingsColumnHeader(/^PA$/).expectVisible();
    });
  });

  test('orders rows by standing (best record first), independent of input order', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    // Rows are the `role="row"` elements that contain data cells (excludes
    // the header row, whose cells are `role="columnheader"`).
    const dataRows = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });
    await expect(dataRows).toHaveCount(3);

    const rowText = await dataRows.allTextContents();

    // Southgate (10-3, .769) > Eastway (7-6, .538) > Northside (4-9, .308).
    const southgateIndex = rowText.findIndex((t) =>
      t.includes('Southgate Marauders'),
    );
    const eastwayIndex = rowText.findIndex((t) => t.includes('Eastway Blitz'));
    const northsideIndex = rowText.findIndex((t) =>
      t.includes('Northside Ironclads'),
    );

    expect(southgateIndex).toBeGreaterThanOrEqual(0);
    expect(eastwayIndex).toBeGreaterThan(southgateIndex);
    expect(northsideIndex).toBeGreaterThan(eastwayIndex);
  });
});

// ── Standings Tab — division grouping ─────────────────────────────────────────

test.describe('Football Standings Tab — division grouping @regression', () => {
  test.describe('desktop', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('groups standings into one table per division', async ({
      page,
      standingsPage,
    }) => {
      await mockFootballStandings(page, { standings: MOCK_DIVISION_STANDINGS });
      await standingsPage.goto(1, 'football');
      await standingsPage.expectNoAppError();

      await expect(page.getByText('NFC West')).toBeVisible();
      await expect(page.getByText('AFC East')).toBeVisible();

      // Two division tables render, one per division.
      await expect(page.getByRole('table')).toHaveCount(2);

      // Each division's own teams render (spot-check the AFC East member).
      await standingsPage.team('Southgate Marauders').expectVisible();
    });
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('groups standings under division label rows in one scrolling table', async ({
      page,
      standingsPage,
    }) => {
      await mockFootballStandings(page, { standings: MOCK_DIVISION_STANDINGS });
      await standingsPage.goto(1, 'football');
      await standingsPage.expectNoAppError();

      // Below 980px the pinned Team pane and the scrolling stats pane share
      // one table so their rows stay aligned (LS-10717); each division is a
      // label row inside it.
      await expect(page.getByRole('table')).toHaveCount(1);
      await expect(
        page.getByRole('row').filter({ hasText: 'NFC West' }),
      ).toBeVisible();
      await expect(
        page.getByRole('row').filter({ hasText: 'AFC East' }),
      ).toBeVisible();

      await standingsPage.team('Southgate Marauders').expectVisible();
    });
  });
});

// ── Standings Tab — historical week selector (LS-6341) ────────────────────────

test.describe('Football Standings Tab — week selector @regression', () => {
  test('renders a week selector once the league has a current week', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page, { currentWeek: 4 });
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    const selector = page.getByLabel('Select week for historical standings');
    await expect(selector).toBeVisible();
    await expect(selector.locator('option')).toHaveText([
      'Current',
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
    ]);
  });

  test('does not render a week selector before the league has a current week', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page, { currentWeek: null });
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    await expect(
      page.getByLabel('Select week for historical standings'),
    ).toHaveCount(0);
  });

  test('re-fetches standings scoped to the selected week and labels the subtitle', async ({
    page,
    standingsPage,
  }) => {
    await mockFootballStandings(page, { currentWeek: 4 });
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    const requestPromise = page.waitForRequest((req) => {
      if (!req.url().includes('/graphql')) return false;
      const body = req.postDataJSON() as {
        variables?: { throughWeek?: number | null };
      } | null;
      return (body?.variables?.throughWeek ?? null) === 2;
    });

    await page
      .getByLabel('Select week for historical standings')
      .selectOption('2');

    await requestPromise;
    await expect(page.getByText(/As of Week 2/)).toBeVisible();
  });
});
