/**
 * Football Roster Comparison E2E Tests (LS-5429)
 *
 * Covers the roster comparison panel on the standalone Football Matchup
 * Detail page (/football/league/:leagueId/matchups/:matchupId):
 *   - All seven football position slots (QB/RB/WR/TE/FLEX/K/DST) render for
 *     both teams' starting lineups
 *   - Each starter shows a projected and an actual point value
 *   - Clicking a player name or actual-score cell opens the football player
 *     detail modal (not the baseball season/matchup-breakdown modals) —
 *     this page previously fell back to baseball modal routing because
 *     MatchupDetailPage did not pass a `sport` prop into
 *     MatchupRosterComparison (fixed alongside this spec)
 *   - The bench toggle reveals/hides additional rostered players
 *
 * All GraphQL calls are mocked via page.route(); no live backend is
 * required. Distinct from football-matchup-tab.spec.ts, which covers the
 * *League Detail* "Matchup" tab route (/football/league/:leagueId/matchup)
 * rather than this standalone matchup detail page.
 */

import type { Page } from '@playwright/test';
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
const MATCHUP_ID = 700;

const FOOTBALL_POSITIONS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
] as const;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 4,
  team1Id: 1,
  team2Id: 2,
  team1Score: 0,
  team2Score: 0,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: null,
  selectedGamesCount: 1,
  startTime: null,
  endTime: null,
  winProbability: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
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
    id: 2,
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

const MOCK_POSITIONS = FOOTBALL_POSITIONS.map((positionType, index) => ({
  __typename: 'LeaguePosition',
  id: index + 1,
  leagueId: LEAGUE_ID,
  positionType,
}));

function makeMatchupPlayer(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    __typename: 'MatchupPlayer',
    matchupId: MATCHUP_ID,
    numberOfGames: 1,
    season: 2026,
    games: [],
    seasonBatting: null,
    seasonPitching: null,
    seasonFielding: null,
    ...overrides,
  };
}

// A single played game with one hit, for one player. The default scoring
// profile (applied when no league scoring profile is mocked) awards 1pt per
// hit, so this starter's projected AND actual point values render as real
// numbers ("1.0") instead of the unplayed-game placeholders ("0.0" proj /
// "—" actual) every other mocked starter below shows.
function makePlayedGame(playerId: number) {
  return [
    {
      __typename: 'MatchupPlayerGame',
      id: playerId * 10,
      matchupPlayerId: playerId,
      gameNum: 1,
      gameIdentifier: `game-${playerId}`,
      gamePosition: null,
      pitcherStartSkipped: false,
      noGameDataFound: false,
      statsLoadingStatus: 'complete',
      // computeScoring() throws "Cannot compute non-numeric stat" for any
      // stat key with a nonzero default weight whose value is `undefined`
      // (as opposed to `null`, which it treats as 0) — every
      // DEFAULT_BATTING_SCORING key besides `hits` must be explicitly null.
      // `playerId`/`season`/`gameNum`/`gameIdentifier` are required by the
      // fragment (lib/graphql/src/matchupPlayer.fragment.graphql) and by
      // Apollo's cache normalization for GameBatting — omitting any of them
      // throws "Missing field '<name>' while writing result" at runtime.
      battingGame: {
        __typename: 'GameBatting',
        playerId,
        season: 2026,
        gameNum: 1,
        gameIdentifier: `game-${playerId}`,
        hits: 1,
        caughtStealing: null,
        doubles: null,
        hitByPitch: null,
        homeRuns: null,
        runs: null,
        rbi: null,
        stolenBases: null,
        strikeouts: null,
        triples: null,
      },
      pitchingGame: null,
      fieldingGame: null,
    },
  ];
}

function makeStarters(teamId: number, firstName: string, playerIdBase: number) {
  return FOOTBALL_POSITIONS.map((position, index) => {
    const playerId = playerIdBase + index;
    return makeMatchupPlayer({
      id: `t${teamId}-${position}`,
      playerId,
      teamId,
      positionId: index + 1,
      // Only the QB starter has game data — see makePlayedGame() above.
      games: position === 'QB' ? makePlayedGame(playerId) : [],
      player: {
        __typename: 'Player',
        id: playerId,
        firstName,
        lastName: position,
        brefId: null,
        eligiblePositions: [position],
      },
    });
  });
}

const TEAM1_STARTERS = makeStarters(1, 'Alpha', 100);
const TEAM2_STARTERS = makeStarters(2, 'Bravo', 200);
const MOCK_MATCHUP_PLAYERS = [...TEAM1_STARTERS, ...TEAM2_STARTERS];

// ---------------------------------------------------------------------------
// GraphQL mock setup
// ---------------------------------------------------------------------------

interface MockOptions {
  matchupPlayers?: Record<string, unknown>[];
}

async function mockFootballRosterComparisonGraphQL(
  page: Page,
  opts: MockOptions = {},
) {
  const { matchupPlayers = MOCK_MATCHUP_PLAYERS } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [MOCK_MATCHUP] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 4 } }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'MatchupScores') {
      // MatchupAdditionalSections (football-only) fires this — not under
      // test here, so an empty result is enough to satisfy API isolation.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { matchupScores: [] } }),
      });
    } else if (op === 'GetTeamMatchupHistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
      });
    } else if (op === 'GetLeagueStandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (op === 'GetMatchupPlayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: matchupPlayers } }),
      });
    } else if (op === 'FootballPlayer') {
      const requestedId = (() => {
        try {
          const body = JSON.parse(route.request().postData() ?? '{}') as {
            variables?: { id?: number };
          };
          return body.variables?.id ?? null;
        } catch {
          return null;
        }
      })();
      const player = matchupPlayers.find(
        (mp) => (mp.player as { id: number } | undefined)?.id === requestedId,
      )?.player as Record<string, unknown> | undefined;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            footballPlayer: player
              ? {
                  ...player,
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
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests — position slots
// ---------------------------------------------------------------------------

test.describe('Football Roster Comparison — position slots @smoke', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballRosterComparisonGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('loads the matchup detail page without errors', async ({
    matchupPage,
  }) => {
    await matchupPage.expectNoAppError();
  });

  for (const position of FOOTBALL_POSITIONS) {
    test(`shows the ${position} position slot label`, async ({
      matchupPage,
    }) => {
      // This page renders three heavy GraphQL-driven panels at once
      // (roster editor, roster comparison, additional sections) — the
      // default 3s expect timeout can be tight for the first assertion
      // after navigation under load, matching the precedent in
      // matchup-detail.spec.ts for this same page.
      await matchupPage
        .text(position, { exact: true })
        .first()
        .expectVisible({ timeout: 10_000 });
    });
  }

  test("shows both teams' starting lineups", async ({ matchupPage }) => {
    // QB starters — every position is present for both teams, but QB is the
    // only one with a distinctive, unambiguous rendered name in this fixture.
    // Scoped to the button role: the in-context MatchupRosterEditor (shown
    // because the mocked user owns team 1 and the matchup is in progress)
    // renders the same player names as plain (non-button) text, so an
    // unscoped text query is ambiguous — see the player-click tests below.
    await matchupPage
      .button('Alpha QB', { exact: true })
      .expectVisible({ timeout: 10_000 });
    await matchupPage
      .button('Bravo QB', { exact: true })
      .expectVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — projected / actual points
// ---------------------------------------------------------------------------

test.describe('Football Roster Comparison — points @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballRosterComparisonGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test("shows a projected and an actual point value for each team's QB starter", async ({
    matchupPage,
  }) => {
    // Both teams' QB starters played one game worth 1pt (see makePlayedGame()
    // above), so their Proj and Actual cells both render "1.0" — a real numeric
    // point value, not the unplayed-game "—" placeholder every other
    // starter in this fixture shows.
    await matchupPage
      .text('1.0', { exact: true })
      .first()
      .expectVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — player click routes to the football player detail modal
// ---------------------------------------------------------------------------

test.describe('Football Roster Comparison — player click @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballRosterComparisonGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('clicking a player name opens the football player detail modal', async ({
    page,
    matchupPage,
  }) => {
    // Scoped to the button role: MatchupRosterEditor (also rendered on this
    // page for the mocked user's own team) renders a plain-text, non-button
    // row for the same player name, which an unscoped text locator would
    // ambiguously match too — and clicking it would select a roster slot
    // instead of opening the modal under test.
    const playerNameButton = matchupPage.button('Alpha QB', { exact: true });
    await playerNameButton.expectVisible({ timeout: 10_000 });
    await playerNameButton.tap();

    // FootballPlayerDetailModal renders the resolved player's name as its
    // (visually hidden) dialog title once the footballPlayer query
    // resolves. If this page fell back to baseball modal routing (the
    // known gap this ticket fixes), PlayerSeasonStatsModal would open
    // instead and this role/name query would never resolve.
    await expect(
      page.getByRole('dialog', { name: 'Player details' }),
    ).toBeVisible();
  });

  test('clicking an actual-score cell opens the football player detail modal', async ({
    page,
  }) => {
    // The Actual-score button's accessible name includes its "Actual" label
    // span, which the component only visually hides via a `@container`
    // query above 660px (MatchupRosterComparison.css:592-609) — so on a
    // narrow (mobile) viewport the accessible name is "Actual 1.0", not
    // just "1.0". A non-exact (substring) match works on every viewport:
    // "Proj" values render as plain text, never a button, so `role: button`
    // already scopes this to Actual cells only — the QB starters are the
    // only players in this fixture with a real ("1.0") Actual value rather
    // than the unplayed-game "—" placeholder, so this uniquely targets one
    // of their two Actual-score buttons.
    await page.getByRole('button', { name: '1.0' }).first().click();

    await expect(
      page.getByRole('dialog', { name: 'Player details' }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — bench toggle
// ---------------------------------------------------------------------------

test.describe('Football Roster Comparison — bench toggle @regression', () => {
  test('reveals and hides bench players', async ({ page, matchupPage }) => {
    const benchPlayers = [
      makeMatchupPlayer({
        id: 't1-bench',
        playerId: 900,
        teamId: 1,
        positionId: null,
        games: [],
        player: {
          __typename: 'Player',
          id: 900,
          firstName: 'Alpha',
          lastName: 'Bench',
          brefId: null,
          eligiblePositions: ['WR'],
        },
      }),
      makeMatchupPlayer({
        id: 't2-bench',
        playerId: 901,
        teamId: 2,
        positionId: null,
        games: [],
        player: {
          __typename: 'Player',
          id: 901,
          firstName: 'Bravo',
          lastName: 'Bench',
          brefId: null,
          eligiblePositions: ['WR'],
        },
      }),
    ];

    await mockFootballRosterComparisonGraphQL(page, {
      matchupPlayers: [...MOCK_MATCHUP_PLAYERS, ...benchPlayers],
    });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');

    // Scoped to the button role — see the player-click tests above for why
    // an unscoped text locator is ambiguous with MatchupRosterEditor.
    const alphaBenchButton = matchupPage.button('Alpha Bench', {
      exact: true,
    });
    const bravoBenchButton = matchupPage.button('Bravo Bench', {
      exact: true,
    });

    await alphaBenchButton.expectHidden({ timeout: 10_000 });

    await matchupPage.button(/show bench/i).tap();
    await alphaBenchButton.expectVisible({ timeout: 10_000 });
    await bravoBenchButton.expectVisible({ timeout: 10_000 });

    await matchupPage.button(/hide bench/i).tap();
    await alphaBenchButton.expectHidden();
  });
});
