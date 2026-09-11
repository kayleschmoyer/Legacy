/**
 * Roster blocked-placement reason E2E test (LS-9768).
 *
 * Tapping an ineligible slot with a player selected used to silently no-op —
 * the tap either deselected or re-selected the slot's occupant with no
 * explanation. `RosterBoard` (lib/shared-components/src/features/roster)
 * now surfaces a dismissible, human-readable reason banner instead.
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
  description: 'E2E blocked-placement-reason test league',
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
};

const MOCK_LEAGUE_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'SP' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
];

/** Nolan Ryan is SP-only — not eligible for the 1B slot (position mismatch). */
const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 103,
    playerId: 503,
    positionId: null, // bench, SP-only
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    isLocked: false,
    player: {
      __typename: 'Player',
      id: 503,
      firstName: 'Nolan',
      lastName: 'Ryan',
      brefId: 'ryanno01',
      eligiblePositions: ['SP'],
      seasonsPlayed: 27,
      careerBatting: null,
    },
  },
];

async function mockRosterGraphQL(page: import('@playwright/test').Page) {
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
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Roster — blocked-placement reason @regression', () => {
  test('explains why a selected player cannot be placed in an ineligible slot', async ({
    page,
    rosterPage,
  }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);

    // Select the SP-only bench player, then tap the ineligible 1B slot.
    await rosterPage.slotButton(/Nolan Ryan — bench/i).tap();
    await rosterPage.slotButton(/1st Base.*open slot/i).tap();

    await rosterPage
      .text(/Nolan Ryan is only eligible for SP.*can't be placed at 1st Base/i)
      .expectVisible();

    // Dismissible, not a crash.
    await rosterPage.expectNoAppError();
    await rosterPage.slotButton('Dismiss').tap();
    await rosterPage.text(/Nolan Ryan is only eligible for SP/i).expectHidden();
  });
});
