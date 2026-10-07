/**
 * Standings Tab — data rendering + "You" tag layout (LS-8659)
 *
 * Covers the ticket's user journey end-to-end: navigate to the league detail
 * page, select the Standings tab from the tab bar, and confirm the ranked
 * team list renders with W/L columns and the current user's team is visually
 * tagged. Also locks in the specific QA finding the ticket was filed from
 * (Android emulator, 2026-07-24): the "You" tag must not overlap the
 * adjacent W/L columns for a long team name on a narrow viewport (where,
 * since LS-10717, the name truncates to one line in the pinned Team column).
 *
 * All GraphQL queries are mocked (route.fulfill only — no route.continue()),
 * so this spec runs without a live backend.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Minimal mock league used across this spec. */
const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E standings tab test league',
  owner: 1,
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
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Home Run Heroes',
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
    name: 'Diamond Dynasty Wildcats',
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
    name: 'Grand Slam Giants',
    owner: 3,
    leagueId: 1,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** teamId 2's name is too long to fit the pinned Team column at 375px. */
const CURRENT_USER_TEAM_NAME = 'Diamond Dynasty Wildcats';

const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Home Run Heroes',
    wins: 10,
    losses: 4,
    ties: 0,
    winPercentage: 0.714,
    pointsFor: 620,
    pointsAgainst: 480,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: CURRENT_USER_TEAM_NAME,
    wins: 6,
    losses: 9,
    ties: 0,
    winPercentage: 0.4,
    pointsFor: 520,
    pointsAgainst: 610,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 3,
    teamName: 'Grand Slam Giants',
    wins: 3,
    losses: 11,
    ties: 0,
    winPercentage: 0.214,
    pointsFor: 450,
    pointsAgainst: 650,
    avatarUrl: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

/** Install GraphQL route handlers for the league detail page. */
async function mockLeagueDetailGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operationName = extractOperationName(route);

    if (operationName === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operationName === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operationName === 'GetLeagueStandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: MOCK_STANDINGS } }),
      });
    } else if (operationName === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operationName === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 2 } }),
      });
    } else if (operationName === 'GetUserLeagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

type Box = { x: number; y: number; width: number; height: number };

/** Asserts a bounding box was found and returns it narrowed to non-null. */
function requireBox(box: Box | null): Box {
  expect(box).not.toBeNull();
  if (box == null) {
    throw new Error('Expected a bounding box, got null');
  }
  return box;
}

/** Standard axis-aligned bounding-box overlap test. */
function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test.describe('Standings Tab — ranked list @regression', () => {
  test("selecting the Standings tab shows the ranked team list with W/L columns and tags the current user's team", async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('Standings');
    await expect(page).toHaveURL(/\/standings/);
    await standingsPage.expectNoAppError();

    // Ranked team list renders every team from the mocked standings.
    await standingsPage.team('Home Run Heroes').expectVisible();
    await standingsPage.team(CURRENT_USER_TEAM_NAME).expectVisible();
    await standingsPage.team('Grand Slam Giants').expectVisible();

    // W/L columns render. Anchored regexes avoid matching "Win%" as a
    // substring of "W" (Playwright's accessible-name matching defaults to
    // substring, not exact).
    await leaguePage.standingsColumnHeader(/^W$/).expectVisible();
    await leaguePage.standingsColumnHeader(/^L$/).expectVisible();

    // The current user's team (teamId 2) is visually tagged.
    await standingsPage.youTag().expectVisible();
    expect(await standingsPage.youTag().count()).toBe(1);
  });
});

test.describe('Standings Tab — "You" tag layout @regression', () => {
  // Narrow, mobile-web viewport — matches the ticket's source QA finding
  // (Android emulator) and the phone width where the pinned Team column is
  // narrowest (LS-10717).
  test.use({ viewport: { width: 375, height: 800 } });

  test('"You" tag does not overlap the W/L columns for a long team name', async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');
    await leaguePage.openTab('Standings');
    await standingsPage.expectNoAppError();

    // The long team name renders in the pinned Team column — truncated to
    // one line with an ellipsis below 980px (LS-10717), its full text still
    // in the DOM / accessible name.
    const row = standingsPage.row(CURRENT_USER_TEAM_NAME);
    await row.byText(CURRENT_USER_TEAM_NAME).expectVisible();

    await standingsPage.youTag().expectVisible();
    const youBox = requireBox(await standingsPage.youTag().boundingBox());

    // Wins (6) and losses (9) are unique values in the stats pane, so an
    // exact-text match unambiguously finds this team's W/L cells.
    const winCell = standingsPage.scrollingStatCell(/^6$/);
    const lossCell = standingsPage.scrollingStatCell(/^9$/);
    const winBox = requireBox(await winCell.boundingBox());
    const lossBox = requireBox(await lossCell.boundingBox());

    expect(boxesOverlap(youBox, winBox)).toBe(false);
    expect(boxesOverlap(youBox, lossBox)).toBe(false);

    // The "You" tag also sits to the left of the W column, not on top of it.
    expect(youBox.x + youBox.width).toBeLessThanOrEqual(winBox.x);
  });
});
