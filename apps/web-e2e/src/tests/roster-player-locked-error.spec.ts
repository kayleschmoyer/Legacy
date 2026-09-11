/**
 * Roster "player locked" error surfacing E2E test (LS-9798).
 *
 * When a manager tries to move a player whose matchup has already started,
 * `checkPlayersNotLocked` (lambdas/db/src/schema/authorization.ts) rejects the
 * mutation with a `MatchupLockedError` (`extensions.code === 'MATCHUP_LOCKED'`).
 * This is an expected, intentional validation — not a bug — so the roster tab
 * must surface it to the manager instead of silently no-oping and logging it
 * as an unexpected error (Rollbar item 233).
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
  description: 'E2E player-locked test league',
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
];

/** One occupied slot the client does not itself believe is locked yet — the
 * server catches the race that let the manager get this far (LS-9798). */
const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 101,
    playerId: 501,
    positionId: 1,
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
];

async function mockLockedRosterGraphQL(page: import('@playwright/test').Page) {
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
      // The server-side lock check rejected the move — same shape a real
      // MatchupLockedError produces (extensions.code, not just message text).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { updateTeamMemberPosition: null },
          errors: [
            {
              message:
                'Player is locked — the matchup for the current week has already started',
              extensions: { code: 'MATCHUP_LOCKED', status: 'in_progress' },
            },
          ],
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Roster — player-locked error surfacing @regression', () => {
  test('shows a dismissible notice instead of silently failing when the matchup has already started', async ({
    page,
    rosterPage,
  }) => {
    await mockLockedRosterGraphQL(page);
    await rosterPage.goto(1);

    // Select the occupied slot, then bench the player — this fires
    // `updateTeamMemberPosition`, which the mock rejects as MATCHUP_LOCKED.
    await rosterPage.slotButton(/Gerrit Cole at SP/i).expectVisible();
    await rosterPage.slotButton(/Gerrit Cole at SP/i).tap();

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );
    await rosterPage.slotButton(/Move Gerrit Cole to bench/i).tap();
    await mutationRequest;

    const notice = rosterPage.text(
      /player is locked.*matchup.*already started/i,
    );
    await notice.expectVisible();

    // The app did not fall through to the global error boundary — this is a
    // handled, user-facing notice, not a crash.
    await rosterPage.expectNoAppError();

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await notice.expectHidden();
  });
});
