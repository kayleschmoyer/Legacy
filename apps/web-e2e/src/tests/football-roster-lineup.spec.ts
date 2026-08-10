/**
 * Football Roster (My Roster) Lineup E2E Tests (LS-5421)
 *
 * Covers the epic LS-5268 user journey for the football League Roster tab
 * (`/football/league/:id/roster`): starter and bench slots render grouped by
 * NFL position (not baseball's Hitters/Pitchers split), and moving a player
 * from the bench into an open starting slot fires the lineup mutation and is
 * reflected in the UI (slot label becomes "{Player} at {POS}") and persists
 * across a reload.
 *
 * All GraphQL queries are mocked so this test runs without a live backend
 * (hermetic — route.fulfill(), not route.continue()).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Gridiron Legends',
  description: 'E2E football roster test league',
  sport: 'football',
  owner: 1,
  maxRosterSize: 16,
  draftStatus: 'completed',
  currentMatchup: 1,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Steel City Blitz',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** A single open QB slot — the only configured starting slot for this test. */
const MOCK_LEAGUE_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'QB' },
];

function mockMember(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TeamMember',
    id: 201,
    playerId: 901,
    positionId: null,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 901,
      firstName: 'Josh',
      lastName: 'Allen',
      brefId: null,
      eligiblePositions: ['QB'],
      seasonsPlayed: 7,
      careerBatting: null,
    },
    ...overrides,
  };
}

async function mockRosterGraphQL(
  page: import('@playwright/test').Page,
  opts: { teamMembers?: ReturnType<typeof mockMember>[] } = {},
) {
  let currentMembers = opts.teamMembers ?? [mockMember()];

  await page.route(isGraphQLEndpoint, async (route) => {
    const operationName = extractOperationName(route).toLowerCase();
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };

    if (operationName === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: currentMembers } }),
      });
    } else if (operationName === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leaguePositions: MOCK_LEAGUE_POSITIONS },
        }),
      });
    } else if (operationName === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operationName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operationName === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operationName === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (operationName === 'updateteammemberposition') {
      const { teamMemberId, positionId } = body.variables ?? {};
      currentMembers = currentMembers.map((m) =>
        m.id === teamMemberId
          ? { ...m, positionId: (positionId as number | null) ?? null }
          : m,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateTeamMemberPosition: {
              __typename: 'TeamMember',
              id: teamMemberId,
              positionId: positionId ?? null,
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Football Roster — starter/bench render grouped by NFL position @regression', () => {
  test('shows a "Starters" section (not Hitters/Pitchers) and the bench player', async ({
    page,
    rosterPage,
  }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1, 'football');

    await expect(page).toHaveURL('/football/league/1/roster');
    await rosterPage.expectNoAppError();

    await rosterPage.heading('Starters').expectVisible({ timeout: 10000 });
    await rosterPage.heading('Starting Hitters').expectCount(0);
    await rosterPage.heading('Starting Pitchers').expectCount(0);
    await rosterPage.text('Josh Allen').expectVisible();
  });
});

test.describe('Football Roster — lineup editing @regression', () => {
  test('moving a bench player into an open starting slot fires the mutation, updates the UI, and persists on reload', async ({
    page,
    rosterPage,
  }) => {
    await mockRosterGraphQL(page, {
      teamMembers: [mockMember({ positionId: null })],
    });
    await rosterPage.goto(1, 'football');

    await rosterPage
      .slotButton(/quarterback — open slot/i)
      .expectVisible({ timeout: 10000 });

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );

    // Select the bench player, then tap the now-eligible QB slot to assign
    // them — mirrors the baseball lineup-editor journey (LS-5360), applied to
    // the football Roster tab surface.
    await rosterPage.slotButton(/josh allen — bench/i).tap();
    await rosterPage.slotButton(/assign josh allen to qb/i).tap();
    await mutationRequest;

    await rosterPage.slotButton(/josh allen at qb/i).expectVisible();

    // Persists across a reload — the assignment round-trips through the mock
    // GraphQL server's mutable `currentMembers`, mirroring a real refetch.
    await page.reload();
    await rosterPage
      .slotButton(/josh allen at qb/i)
      .expectVisible({ timeout: 10000 });
  });
});
