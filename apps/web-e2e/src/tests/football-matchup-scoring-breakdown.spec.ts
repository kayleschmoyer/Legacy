/**
 * Football Matchup Scoring Breakdown / Box Score E2E Tests (LS-5431)
 *
 * Covers the per-player scoring breakdown / box score on the dedicated
 * football matchup detail page (/football/league/:leagueId/matchups/:matchupId),
 * per the LS-5269 epic journey: "As a user, I want a per-player scoring
 * breakdown / box score so that I can see how each starter contributed."
 *
 * `MatchupRosterComparison` (apps/web/src/features/matchup/MatchupRosterComparison.tsx)
 * renders this section for both sports; it takes a `sport` prop that swaps
 * baseball labels/position-grouping/click-routing for football-specific ones.
 * `MatchupDetailPage` previously never passed that prop, so the football
 * matchup detail route silently fell back to the baseball presentation
 * (fixed alongside this spec — LS-5431).
 *
 * Player rows use `games: []` (no batting/pitching/fielding game stats) —
 * matching the component's own unit tests (MatchupRosterComparison.spec.tsx,
 * "MatchupRosterComparison — football (LS-5418)") and real production
 * behavior: `MatchupPlayer.games[].battingGame/pitchingGame/fieldingGame`
 * are baseball-only fields with no football equivalent, so a football
 * player's per-game score is always 0 today. This spec therefore asserts
 * the presentation behavior that genuinely works (labels, position
 * grouping, click-routing) rather than fabricating fantasy-point data no
 * real football matchup could ever produce. The fantasy-points computation
 * gap itself is tracked separately (see the linked Bug ticket in this
 * feature's QA-coverage doc).
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const TEAM1_ID = 1;
const TEAM2_ID = 2;
const QB_SLOT_ID = 101;
const RB_SLOT_ID = 102;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 5,
  team1Id: TEAM1_ID,
  team2Id: TEAM2_ID,
  team1Score: 80.2,
  team2Score: 75.4,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 0,
  pitcherStartsPerMatchup: 0,
  selectedGamesCount: 0,
  startTime: null,
  endTime: null,
};

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: TEAM1_ID,
    name: 'Gridiron Giants',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: TEAM2_ID,
    name: 'End Zone Eagles',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: QB_SLOT_ID,
    leagueId: LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: RB_SLOT_ID,
    leagueId: LEAGUE_ID,
    positionType: 'RB',
  },
];

function footballMatchupPlayer(
  id: string,
  teamId: number,
  playerId: number,
  positionId: number,
  firstName: string,
  lastName: string,
) {
  return {
    __typename: 'MatchupPlayer',
    id,
    matchupId: MATCHUP_ID,
    playerId,
    teamId,
    positionId,
    season: 2026,
    numberOfGames: 1,
    seasonBatting: null,
    seasonPitching: null,
    seasonFielding: null,
    player: {
      __typename: 'Player',
      id: playerId,
      firstName,
      lastName,
      brefId: null,
      eligiblePositions: ['QB'],
    },
    // No per-game batting/pitching/fielding stats — see file header: football
    // players never populate these baseball-only fields in production.
    games: [],
  };
}

const MOCK_MATCHUP_PLAYERS = [
  footballMatchupPlayer('mp-1', TEAM1_ID, 901, QB_SLOT_ID, 'Pat', 'Thrower'),
  footballMatchupPlayer('mp-2', TEAM2_ID, 902, QB_SLOT_ID, 'Chris', 'Signal'),
  footballMatchupPlayer('mp-3', TEAM1_ID, 903, RB_SLOT_ID, 'Marcus', 'Runner'),
  footballMatchupPlayer('mp-4', TEAM2_ID, 904, RB_SLOT_ID, 'Devon', 'Sprint'),
];

async function mockMatchupGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      switch (extractOperationName(route)) {
        case 'GetMatchupById':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
          });
          break;
        case 'GetMatchupsForLeague':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { getMatchupsForLeague: [MOCK_MATCHUP] },
            }),
          });
          break;
        case 'GetCurrentWeekForLeague':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getCurrentWeekForLeague: 5 } }),
          });
          break;
        case 'GetUserTeamId':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { userTeamId: null } }),
          });
          break;
        case 'GetLeagueTeams':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
          });
          break;
        case 'GetLeagueById':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
          });
          break;
        case 'GetMatchupPlayers':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { getMatchupPlayers: MOCK_MATCHUP_PLAYERS },
            }),
          });
          break;
        case 'GetPositionsForLeague':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
          });
          break;
        case 'GetLeagueScoringProfile':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { leagueScoringProfile: null } }),
          });
          break;
        case 'MatchupScores':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { matchupScores: [] } }),
          });
          break;
        case 'GetTeamMatchupHistory':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
          });
          break;
        case 'GetLeagueStandings':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getLeagueStandings: [] } }),
          });
          break;
        case 'FootballPlayer': {
          // FootballPlayerDetailModal fires `useFootballPlayerQuery`
          // ("FootballPlayer", FootballPlayerHeader/DetailExtras fragments) —
          // a distinct operation from the "GetFootballPlayer" query used
          // elsewhere in the app. Mirrors the fixture already proven in
          // football-matchup-tab.spec.ts's 'footballplayer' mock.
          const postData = route.request().postData() ?? '{}';
          const requestedId = (
            JSON.parse(postData) as { variables?: { id?: number } }
          ).variables?.id;
          const match = MOCK_MATCHUP_PLAYERS.find(
            (mp) => mp.playerId === requestedId,
          );
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                footballPlayer: match
                  ? {
                      __typename: 'FootballPlayer',
                      id: match.playerId,
                      firstName: match.player.firstName,
                      lastName: match.player.lastName,
                      position: 'QB',
                      isDst: false,
                      nflTeam: 'KC',
                      pfrId: null,
                      headshotUrl: null,
                      previousTeams: null,
                      projectedFantasyPoints: null,
                      adpRank: null,
                      careerStats: null,
                    }
                  : null,
              },
            }),
          });
          break;
        }
        default:
          await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests — scoring breakdown / box score structure
// ---------------------------------------------------------------------------

test.describe('Football Matchup Scoring Breakdown – structure @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('shows the football "Starting Lineup" heading, not the baseball batters/pitchers split', async ({
    matchupPage,
  }) => {
    // Generous timeout on the first assertion per test — full V2 bundle
    // hydration + the roster-comparison query chain can take a few seconds
    // under load (same rationale as matchup-detail.spec.ts's loading-state
    // test).
    await matchupPage
      .text('Starting Lineup', { exact: true })
      .expectVisible({ timeout: 10_000 });
    await matchupPage.text('Starting Lineup — Batters').expectHidden();
    await matchupPage.text('Starting Lineup — Pitchers').expectHidden();
  });

  test('shows the football "Team Total" totals row label, not "Hitters Total"', async ({
    matchupPage,
  }) => {
    await matchupPage.text('Team Total').expectVisible({ timeout: 10_000 });
    await matchupPage.text('Hitters Total').expectHidden();
  });

  test('shows each starting player row for both teams', async ({
    matchupPage,
  }) => {
    await matchupPage.text('Pat Thrower').expectVisible({ timeout: 10_000 });
    await matchupPage.text('Chris Signal').expectVisible();
    await matchupPage.text('Marcus Runner').expectVisible();
    await matchupPage.text('Devon Sprint').expectVisible();
  });

  test('shows football position slot labels (QB, RB)', async ({
    matchupPage,
  }) => {
    await matchupPage
      .text('QB', { exact: true })
      .first()
      .expectVisible({ timeout: 10_000 });
    await matchupPage.text('RB', { exact: true }).first().expectVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — clicking a player routes to the football player detail modal
// ---------------------------------------------------------------------------

test.describe('Football Matchup Scoring Breakdown – player click @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('clicking a player name opens the football player detail modal, not the baseball season-stats modal', async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.text('Pat Thrower').expectVisible({ timeout: 10_000 });
    await matchupPage.text('Pat Thrower').tap();

    // FootballPlayerDetailModal's dialog title is the resolved player's name
    // once the FootballPlayer query returns (BaseModal hideHeader keeps it
    // visually hidden but present as the accessible dialog name).
    await expect(
      page.getByRole('dialog', { name: 'Pat Thrower' }),
    ).toBeVisible();
  });

  test("clicking a player's actual score also opens the football player detail modal", async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.text('Marcus Runner').expectVisible({ timeout: 10_000 });
    // The "Actual" score button's accessible name is unreliable here — its
    // "Actual" label span is `display: none` at narrow viewports (CSS,
    // MatchupRosterComparison.css `.mrc-sc .mrc-lab`), collapsing the name to
    // just the score value ("—" for an unplayed player). Target the stable
    // `.mrc-actual` class within the player's row instead of a role+name query.
    await page
      .locator('.mrc-cell', { hasText: 'Marcus Runner' })
      .locator('button.mrc-actual')
      .click();

    await expect(
      page.getByRole('dialog', { name: 'Marcus Runner' }),
    ).toBeVisible();
  });
});
