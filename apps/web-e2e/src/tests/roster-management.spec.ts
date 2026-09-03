/**
 * Roster Management E2E Tests
 *
 * Covers the League Roster Management tab at /baseball/league/:id/roster.
 * Tests the lineup slots, bench/bullpen regions, player name display,
 * and UI state management.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8451 / ADR-0016): roster assertions speak
// `rosterPage` driver verbs so the spec is selector-free and native-ready.
// `page` is retained only for GraphQL route mocking (a web-only capability) and
// URL assertions — mirroring the migrated standings spec.

/** URL predicate for the GraphQL API endpoint */

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E roster management test league',
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

/** League positions — one slot per type for minimal lineup */
const MOCK_LEAGUE_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'SP' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: 'C' },
  { __typename: 'LeaguePosition', id: 3, leagueId: 1, positionType: '1B' },
  { __typename: 'LeaguePosition', id: 4, leagueId: 1, positionType: 'CF' },
  { __typename: 'LeaguePosition', id: 5, leagueId: 1, positionType: 'UTIL' },
];

/** Team members — some in lineup (positionId set), some on bench (positionId null) */
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
    positionId: 3, // 1B slot → in lineup
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
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
  {
    __typename: 'TeamMember',
    id: 103,
    playerId: 503,
    positionId: null, // bench
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 503,
      firstName: 'Mookie',
      lastName: 'Betts',
      brefId: 'bettsmo01',
      eligiblePositions: ['CF', 'RF'],
      seasonsPlayed: 9,
      careerBatting: { __typename: 'CareerBatting', games: 1100 },
    },
  },
];

async function mockRosterGraphQL(
  page: import('@playwright/test').Page,
  opts: { emptyRoster?: boolean; membersError?: boolean } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getteammembers') {
      if (opts.membersError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load roster' }],
            data: { teamMembers: null },
          }),
        });
      } else if (opts.emptyRoster) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers: [] } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers: MOCK_TEAM_MEMBERS } }),
        });
      }
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
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
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

test.describe('Roster Management — navigation @smoke', () => {
  test('navigates to the roster tab without errors', async ({
    page,
    rosterPage,
  }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);

    await expect(page).toHaveURL('/baseball/league/1/roster');
    await rosterPage.expectNoAppError();
  });
});

test.describe('Roster Management – layout @regression', () => {
  test.beforeEach(async ({ page, rosterPage }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);
  });

  test('shows "My Roster" heading', async ({ rosterPage }) => {
    await rosterPage.text('My Roster').first().expectVisible();
  });

  test('shows Starting Hitters lineup section', async ({ rosterPage }) => {
    // RosterBoardV2 renders the lineup as "Starting Hitters" / "Starting
    // Pitchers" sections (h2 card titles); there is no separate quickstat strip.
    await rosterPage.heading('Starting Hitters').expectVisible();
  });

  test('shows Bench section', async ({ rosterPage }) => {
    // The bench renders as a dedicated "Bench" section in RosterBoardV2.
    await rosterPage.heading('Bench').expectVisible();
  });

  test('shows open lineup slots', async ({ rosterPage }) => {
    // Positions C, CF and UTIL have no assigned player, so each empty slot
    // renders an "Open slot" sub-label in RosterBoardV2.
    await rosterPage.text('Open slot').first().expectVisible();
  });
});

test.describe('Roster Management – player data @regression', () => {
  test.beforeEach(async ({ page, rosterPage }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);
  });

  test('shows player in SP lineup slot', async ({ rosterPage }) => {
    // Gerrit Cole is assigned to positionId 1 (SP)
    await rosterPage.text('Gerrit Cole').expectVisible();
  });

  test('shows player in infield lineup slot (1B)', async ({ rosterPage }) => {
    // Freddie Freeman is assigned to the 1B slot
    await rosterPage.text('Freddie Freeman').expectVisible();
  });

  test('shows bench player not in lineup', async ({ rosterPage }) => {
    // Mookie Betts has positionId:null → on bench
    await rosterPage.text('Mookie Betts').expectVisible();
  });

  test('shows SP position type label', async ({ rosterPage }) => {
    // The Starting Pitchers section contains the SP slot. Scope to that card
    // (RosterBoard SectionCard → data-testid="roster-section-pitchers") to avoid
    // collisions with other "SP" text elsewhere on the page.
    await rosterPage.pitchersSection
      .byText('SP', { exact: true })
      .first()
      .expectVisible();
  });
});

test.describe('Roster Management – bench/bullpen regions @regression', () => {
  test.beforeEach(async ({ page, rosterPage }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);
  });

  test('shows Bench region', async ({ rosterPage }) => {
    // RosterBoardV2 renders a "Bench" section split into Hitters / Pitchers
    // sub-groups. Assert the Bench section heading plus the Hitters sub-group.
    await rosterPage.heading('Bench').expectVisible();
    await rosterPage
      .text(/Hitters · \d+/)
      .first()
      .expectVisible();
  });
});

test.describe('Roster Management — empty roster @regression', () => {
  test('shows empty roster state gracefully', async ({ page, rosterPage }) => {
    await mockRosterGraphQL(page, { emptyRoster: true });
    await rosterPage.goto(1);

    // Page should not crash
    await rosterPage.expectNoAppError();
    // Roster heading should still appear
    await rosterPage.text('My Roster').first().expectVisible();
  });

  test('shows empty bench message when no bench players', async ({
    page,
    rosterPage,
  }) => {
    await mockRosterGraphQL(page, { emptyRoster: true });
    await rosterPage.goto(1);

    await rosterPage.text('Bench is empty').expectVisible();
  });
});

test.describe('Roster Management — aria attributes for lineup slots @regression', () => {
  test.beforeEach(async ({ page, rosterPage }) => {
    await mockRosterGraphQL(page);
    await rosterPage.goto(1);
  });

  test('roster slot for occupied position has correct aria-label', async ({
    rosterPage,
  }) => {
    // Gerrit Cole at SP
    await rosterPage.slotButton(/Gerrit Cole at SP/i).expectVisible();
  });

  test('empty lineup slot has aria-label indicating open slot', async ({
    rosterPage,
  }) => {
    // Positions C, CF, UTIL have no assigned player → open slots
    await rosterPage
      .slotButton(/open slot/i)
      .first()
      .expectVisible();
  });
});
