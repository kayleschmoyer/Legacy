/**
 * Roster future-week lineup editing E2E test (LS-9768).
 *
 * The roster tab used to force `readOnly` for any week other than the
 * league's current week, so navigating ahead to set a lineup in advance
 * silently disabled every slot with a "Future Week — Read Only" banner. Only
 * a finalized *past* week should be locked — future weeks must stay
 * editable so managers can set lineups ahead of time.
 *
 * All GraphQL is mocked, so this runs without a live backend (hermetic —
 * route.fulfill(), not route.continue()).
 */
import { test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E future-week roster test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 5,
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
  waiverType: 'standard',
  currentWeekNumber: 5,
  totalMatchups: 17,
  seasonNumber: 2024,
};

const MOCK_LEAGUE_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'SP' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
];

const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 101,
    playerId: 501,
    positionId: 1, // SP slot → in lineup
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    isLocked: false,
    player: {
      __typename: 'Player',
      id: 501,
      firstName: 'Gerrit',
      lastName: 'Cole',
      brefId: 'colege01',
      eligiblePositions: ['SP'],
      seasonsPlayed: 10,
      careerBatting: null,
    },
  },
  {
    __typename: 'TeamMember',
    id: 102,
    playerId: 502,
    positionId: null, // bench, eligible at 1B
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    isLocked: false,
    player: {
      __typename: 'Player',
      id: 502,
      firstName: 'Freddie',
      lastName: 'Freeman',
      brefId: 'freemfr01',
      eligiblePositions: ['1B'],
      seasonsPlayed: 12,
      careerBatting: { __typename: 'CareerBatting', games: 1800 },
    },
  },
];

async function mockFutureWeekRosterGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: MOCK_TEAM_MEMBERS } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leaguePositions: MOCK_LEAGUE_POSITIONS },
        }),
      });
    } else if (operation === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: [] } }),
      });
    } else if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (operation === 'updateteammemberposition') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateTeamMemberPosition: {
              __typename: 'TeamMember',
              id: 102,
              positionId: 2,
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Roster — future-week lineup editing @regression', () => {
  test('lets a manager set a lineup for an upcoming week instead of forcing it read-only', async ({
    page,
    rosterPage,
  }) => {
    await mockFutureWeekRosterGraphQL(page);
    await rosterPage.goto(1);

    await rosterPage.slotButton(/Gerrit Cole at SP/i).expectVisible();

    // Advance one week ahead of the league's current week (5 → 6).
    await rosterPage.slotButton('Next week').tap();

    // The old "Future Week — Read Only" copy is gone; the page tells the
    // manager they're setting a lineup ahead of time instead of blocking them.
    await rosterPage.text('Upcoming Week').expectVisible();
    await rosterPage.text(/Future Week.*Read Only/i).expectHidden();

    // The board itself must still accept edits: select the bench player
    // eligible for the open 1B slot and assign them.
    await rosterPage.slotButton(/Freddie Freeman — bench/i).tap();

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint.test(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );
    await rosterPage.slotButton(/Assign Freddie Freeman to 1B/i).tap();
    await mutationRequest;

    await rosterPage.expectNoAppError();
  });

  test('still locks lineup editing for a finalized past week', async ({
    page,
    rosterPage,
  }) => {
    await mockFutureWeekRosterGraphQL(page);
    await rosterPage.goto(1);

    await rosterPage.slotButton(/Gerrit Cole at SP/i).expectVisible();

    // Step back one week before the league's current week (5 → 4).
    await rosterPage.slotButton('Previous week').tap();

    await rosterPage.text('Historical Mode').expectVisible();
    // A locked/past-week board disables its rows outright — not just visually.
    await rosterPage.slotButton(/Freddie Freeman — bench/i).expectDisabled();
  });
});
