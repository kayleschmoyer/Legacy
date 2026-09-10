/**
 * E2E Tests: Player Detail Deep Linking from Multiple Surfaces (LS-5581)
 *
 * Covers the scenario where a user navigates to /players/:id from:
 *   - Roster tab: click "View player detail" chevron → route navigation
 *   - Free agents tab: URL deep link (intent-based navigation)
 *   - Draft board: click player row → in-place PlayerDetailModal
 *   - Matchup detail: URL deep link (intent-based navigation)
 *
 * Platforms: web (mobile-web and Android intent paths share the same URL so
 * any pass here is representative). Entitlement: all (no premium gate).
 *
 * GraphQL mocks are inline (ADR-0015 §6). Element access through the
 * injected `playersPage` semantic object (ADR-0015 §5).
 */

import { test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import type { FreeAgentsPage, LeaguePage, MatchupPage } from '../pages';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const PLAYER_ID = 101;
const PLAYER_FIRST = 'Babe';
const PLAYER_LAST = 'Ruth';
const MATCHUP_ID = 10;

const ROSTER_URL = `/baseball/league/${LEAGUE_ID}/roster`;
const DRAFT_URL = `/baseball/league/${LEAGUE_ID}/draft`;

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Test League',
  description: '',
  owner: 1,
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
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Sluggers',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
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
    name: 'Bashers',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 80,
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
    id: 1,
    leagueId: LEAGUE_ID,
    positionType: 'C',
  },
  {
    __typename: 'LeaguePosition',
    id: 2,
    leagueId: LEAGUE_ID,
    positionType: '1B',
  },
  {
    __typename: 'LeaguePosition',
    id: 5,
    leagueId: LEAGUE_ID,
    positionType: 'SS',
  },
  {
    __typename: 'LeaguePosition',
    id: 6,
    leagueId: LEAGUE_ID,
    positionType: 'OF',
  },
];

const MOCK_TEAM_MEMBER = {
  __typename: 'TeamMember',
  id: 1,
  playerId: PLAYER_ID,
  positionId: 6,
  teamId: 1,
  leagueId: LEAGUE_ID,
  onTradeBlock: false,
  salary: null,
  player: {
    __typename: 'Player',
    id: PLAYER_ID,
    firstName: PLAYER_FIRST,
    lastName: PLAYER_LAST,
    brefId: 'ruthba01',
    eligiblePositions: ['OF'],
    seasonsPlayed: 22,
    careerBatting: { games: 2503, __typename: 'CareerBatting' },
  },
};

const MOCK_DRAFT = {
  __typename: 'Draft',
  id: 1,
  status: 'not-started',
  currentPick: null,
  totalRounds: 25,
  totalPicks: 100,
  draftType: 'snake',
  secondsPerPick: 90,
  scheduledFor: null,
};

/** Batting season stats for the deep-link player. */
const SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['OF'],
      firstName: PLAYER_FIRST,
      lastName: PLAYER_LAST,
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 1927,
        team: 'NYY',
        games: 151,
        plateAppearances: 692,
        atBats: 540,
        runs: 158,
        hits: 192,
        doubles: 29,
        triples: 8,
        homeRuns: 60,
        rbi: 164,
        stolenBases: 7,
        caughtStealing: 6,
        baseOnBalls: 138,
        strikeouts: 89,
        battingAverage: 0.356,
        onBasePercentage: 0.486,
        sluggingPercentage: 0.772,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Career arc data for the deep-link player. */
const CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: PLAYER_FIRST,
      lastName: PLAYER_LAST,
      eligiblePositions: ['OF'],
      careerAchievements: {
        allStarSelections: 2,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 1,
        cyYoungAwards: 0,
        hallOfFame: true,
        rookieOfTheYear: false,
      },
    },
    playerSeasonBatting: [
      {
        season: 1927,
        team: 'NYY',
        games: 151,
        hits: 192,
        atBats: 540,
        homeRuns: 60,
        rbi: 164,
        stolenBases: 7,
        battingAverage: 0.356,
        onBasePercentage: 0.486,
        sluggingPercentage: 0.772,
        onBasePlusSlugging: 1.258,
        onBasePlusSluggingPlus: 225,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

// ── Shared setup helpers ───────────────────────────────────────────────────────

/** Install GraphQL mocks for the player detail modal queries. */
async function installPlayerDetailMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getallplayerseasonstats: (route) =>
      fulfillJson(route, SEASON_STATS_RESPONSE),
    getplayercareerarc: (route) => fulfillJson(route, CAREER_ARC_RESPONSE),
  });
}

/** Install GraphQL mocks for the league-roster tab surface. */
async function installRosterMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: MOCK_POSITIONS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: [MOCK_TEAM_MEMBER] } }),
    getteamwaiverclaims: (route) =>
      fulfillJson(route, { data: { teamWaiverClaims: [] } }),
    getteamtradeoffers: (route) =>
      fulfillJson(route, { data: { teamTradeOffers: [] } }),
    getcurrentweekforleague: (route) =>
      fulfillJson(route, { data: { getCurrentWeekForLeague: 1 } }),
    getmatchupsforleague: (route) =>
      fulfillJson(route, { data: { getMatchupsForLeague: [] } }),
    getmatchupbyid: (route) =>
      fulfillJson(route, { data: { getCurrentMatchup: null } }),
    getmatchupplayers: (route) =>
      fulfillJson(route, { data: { getMatchupPlayers: [] } }),
    getleaguedraft: (route) =>
      fulfillJson(route, { data: { getLeagueDraft: MOCK_DRAFT } }),
    getdraftteamorder: (route) =>
      fulfillJson(route, { data: { getDraftTeamOrder: [] } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
    getleagueactivity: (route) =>
      fulfillJson(route, { data: { leagueActivity: [] } }),
  });
}

/** Install GraphQL mocks for the free-agents tab surface. */
async function installFreeAgentsMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  const mockFreeAgent = {
    __typename: 'Player',
    id: PLAYER_ID,
    firstName: PLAYER_FIRST,
    lastName: PLAYER_LAST,
    brefId: 'ruthba01',
    eligiblePositions: ['OF'],
    scoring: {
      battingScore: 95,
      pitchingScore: 0,
      fieldingScore: 70,
      hitterScore: 90,
      hitterAvgPointsPerGame: 12.5,
      pitchingAvgPointsPerGame: 0,
      totalScore: 150,
      careerGames: 2503,
      avgPointsPerGame: 10.2,
    },
    averageSeasonBatting: {
      seasons: 22,
      games: 140,
      atBats: 500,
      runs: 120,
      hits: 180,
      homeRuns: 35,
      rbi: 120,
      stolenBases: 8,
      battingAverage: 0.342,
      onBasePercentage: 0.474,
      sluggingPercentage: 0.69,
    },
    careerBatting: {
      games: 2503,
      runs: 2174,
      homeRuns: 714,
      rbi: 2213,
      stolenBases: 123,
      hits: 2873,
      atBats: 8399,
      plateAppearances: 10626,
      baseOnBalls: 2062,
      hitByPitch: 43,
      sacrificeHits: 113,
      totalBases: 5793,
      offensiveWAR: 162.7,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 2,
      mvpAwards: 1,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 7,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
    primaryEra: 'Dead Ball',
  };

  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: MOCK_POSITIONS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getfreeagentplayers: (route) =>
      fulfillJson(route, { data: { freeAgents: [mockFreeAgent] } }),
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: [MOCK_TEAM_MEMBER] } }),
    getteamwaiverclaims: (route) =>
      fulfillJson(route, { data: { teamWaiverClaims: [] } }),
    getteamtradeoffers: (route) =>
      fulfillJson(route, { data: { teamTradeOffers: [] } }),
    getcurrentweekforleague: (route) =>
      fulfillJson(route, { data: { getCurrentWeekForLeague: 1 } }),
    getmatchupsforleague: (route) =>
      fulfillJson(route, { data: { getMatchupsForLeague: [] } }),
    getmatchupbyid: (route) =>
      fulfillJson(route, { data: { getCurrentMatchup: null } }),
    getleaguedraft: (route) =>
      fulfillJson(route, { data: { getLeagueDraft: MOCK_DRAFT } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
  });
}

/** Install GraphQL mocks for the draft board surface. */
async function installDraftMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  const mockDraftPlayer = {
    __typename: 'DraftPlayer',
    id: PLAYER_ID,
    firstName: PLAYER_FIRST,
    lastName: PLAYER_LAST,
    brefId: 'ruthba01',
    eligiblePositions: ['OF'],
    hitterAvgPointsPerGame: 12.5,
    pitchingAvgPointsPerGame: null,
    projectedMatchupPoints: 30.0,
  };

  const draftInProgress = {
    __typename: 'Draft',
    id: 1,
    leagueId: LEAGUE_ID,
    status: 'in-progress',
    currentRound: 1,
    currentPick: 1,
    totalRounds: 25,
    totalPicks: 100,
    draftType: 'snake',
    secondsPerPick: 90,
    scheduledFor: null,
  };

  // Career batting stats — the statsLookup Map is keyed by playerId and built
  // from this query. Without it, handlePlayerClick returns early and the modal
  // never opens (LS-5581).
  const mockCareerBatting = {
    edges: [
      {
        node: {
          playerId: PLAYER_ID,
          games: 2503,
          atBats: 8399,
          hits: 2873,
          homeRuns: 714,
          rbi: 2213,
          runs: 2174,
          stolenBases: 123,
          battingAverage: 0.342,
          onBasePercentage: 0.474,
          sluggingPercentage: 0.69,
          offensiveWAR: 162.7,
          player: {
            id: PLAYER_ID,
            firstName: PLAYER_FIRST,
            lastName: PLAYER_LAST,
          },
        },
      },
    ],
    totalCount: 1,
  };

  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, {
        data: {
          league: {
            ...MOCK_LEAGUE,
            draftStatus: 'in-progress',
            activeDraftId: 1,
          },
        },
      }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: MOCK_POSITIONS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getlivedraftleaguedraft: (route) =>
      fulfillJson(route, { data: { getLeagueDraft: draftInProgress } }),
    getavailabledraftplayers: (route) =>
      fulfillJson(route, {
        data: { getAvailableDraftPlayers: [mockDraftPlayer] },
      }),
    getdraftplayerstats: (route) =>
      fulfillJson(route, {
        data: { careerBattingStats: mockCareerBatting },
      }),
    getdraftpitchingstats: (route) =>
      fulfillJson(route, { data: { careerPitchingStats: [] } }),
    getdraftpicks: (route) =>
      fulfillJson(route, { data: { getDraftPicks: [] } }),
    getcurrentdraftpick: (route) =>
      fulfillJson(route, {
        data: {
          getCurrentDraftPick: {
            __typename: 'DraftPick',
            id: 1,
            round: 1,
            pickNumber: 1,
            overallPick: 1,
            teamId: 1,
            playerId: null,
            player: null,
          },
        },
      }),
    getdraftteamorder: (route) =>
      fulfillJson(route, {
        data: { getDraftTeamOrder: [{ teamId: 1, pickOrder: 1 }] },
      }),
    getleaguescoringprofile: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    getmydraftqueue: (route) =>
      fulfillJson(route, { data: { getMyDraftQueue: [] } }),
    getmydraftteamautopick: (route) =>
      fulfillJson(route, { data: { getMyDraftTeamAutoPick: false } }),
    getdraftteamautopickstatuses: (route) =>
      fulfillJson(route, { data: { getDraftTeamAutoPickStatuses: [] } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
  });
}

/** Install GraphQL mocks for the matchup detail surface. */
async function installMatchupMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  const mockMatchup = {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 3,
    team1Id: 1,
    team2Id: 2,
    team1Score: 42.5,
    team2Score: 38.1,
    status: 'in_progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 4,
    startTime: null,
    endTime: null,
  };

  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getmatchupbyid: (route) =>
      fulfillJson(route, { data: { getMatchupById: mockMatchup } }),
    getmatchupsforleague: (route) =>
      fulfillJson(route, { data: { getMatchupsForLeague: [mockMatchup] } }),
    getcurrentweekforleague: (route) =>
      fulfillJson(route, { data: { getCurrentWeekForLeague: 3 } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getmatchupplayers: (route) =>
      fulfillJson(route, { data: { getMatchupPlayers: [] } }),
    getleaguedraft: (route) =>
      fulfillJson(route, { data: { getLeagueDraft: MOCK_DRAFT } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
  });
}

// ── Origin-surface helpers ─────────────────────────────────────────

/**
 * Why these helpers gate on rendered content instead of `waitForLoadState`
 * (LS-9839).
 *
 * The deep-link tests browse an origin surface first, then follow a
 * `/players/:id` URL. `page.goto(origin)` + `waitForLoadState('load')` only
 * resolves the document `load` event — React is still resolving that route's
 * lazily-imported chunk (`apps/web/src/utils/lazyWithRetry.ts`). Starting the
 * deep-link navigation while that import is in flight aborts the chunk
 * request; `lazyWithRetry` cannot tell an abort from the stale-chunk 404 it
 * was built for, so it calls `window.location.reload()`. That reload is a
 * second navigation back to the origin surface, and it interrupts the deep
 * link:
 *
 *   page.goto: Navigation to ".../players/101" is interrupted by another
 *   navigation to ".../baseball/league/1/matchups/10"
 *
 * WebKit and Mobile Safari load chunks slowly enough to lose this race; the
 * other projects usually win it, which is why the failures were WebKit-only
 * and a different subset failed on each run. Waiting for the origin route to
 * actually render proves its chunk resolved, so there is no in-flight import
 * left for the deep link to abort.
 *
 * The one deep-link test that never flaked — "player in draft pool can be
 * deep-linked from draft board context" — already gated this way.
 */

/**
 * Open the free-agents surface and wait until its route has rendered.
 *
 * Gated on the league-detail `<h1>` rather than on a free-agent row: the tab
 * reads `GetPlayersWithStats`, which these specs do not stub, so the list
 * itself renders empty. The heading still proves the lazily-imported
 * league-detail route resolved and committed, which is what the deep link
 * needs.
 */
async function openFreeAgentsSurface(
  freeAgentsPage: FreeAgentsPage,
  leaguePage: LeaguePage,
): Promise<void> {
  await freeAgentsPage.goto(LEAGUE_ID);
  await leaguePage.expectDetailLoaded(MOCK_LEAGUE.name);
}

/** Open the matchup-detail surface and wait until its route has rendered. */
async function openMatchupSurface(matchupPage: MatchupPage): Promise<void> {
  await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  await matchupPage.mainRegion.expectVisible();
}

// ── Tests: deep link from roster ──────────────────────────────────────────────

test.describe('Player Detail Deep Link — from Roster @regression', () => {
  test('clicking "View player detail" on a roster player navigates to /players/:id', async ({
    page,
    playersPage,
  }) => {
    // Install roster mocks first (LIFO: registered earlier = lower priority)
    await installRosterMocks(page);
    // Install player detail mocks (higher priority, registered last)
    await installPlayerDetailMocks(page);

    await page.goto(ROSTER_URL);
    await page.waitForLoadState('load');

    // Wait for the player's name to appear in the roster list
    await page.waitForSelector(`text=${PLAYER_FIRST} ${PLAYER_LAST}`, {
      timeout: 15000,
    });

    // Click the "View {player} detail" chevron button on the roster row.
    // LS-9795: carried an unexplained `{ force: true }`; the roster row's
    // chevron is an ordinary top-most button and clicks cleanly without it.
    await page
      .getByRole('button', {
        name: `View ${PLAYER_FIRST} ${PLAYER_LAST} detail`,
      })
      .click();

    // The click navigates to /players/:id
    await page.waitForURL(`**/players/${PLAYER_ID}`, { timeout: 15000 });

    // The player detail modal should be open
    await playersPage.detail.expectOpen();
  });

  test('URL deep link to /players/:id from roster context opens player modal', async ({
    page,
    playersPage,
  }) => {
    await installPlayerDetailMocks(page);

    // Simulate a user who copies a player URL while browsing the roster and
    // navigates to it directly (also covers Android intent deep links).
    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText(`${PLAYER_FIRST} ${PLAYER_LAST}`);
  });
});

// ── Tests: deep link from free agents ────────────────────────────────────────

test.describe('Player Detail Deep Link — from Free Agents @regression', () => {
  test('URL deep link to /players/:id from free-agents context opens player modal', async ({
    page,
    freeAgentsPage,
    leaguePage,
    playersPage,
  }) => {
    await installFreeAgentsMocks(page);
    await installPlayerDetailMocks(page);

    // Navigate to the free-agents surface first (simulates the browsing context)
    await openFreeAgentsSurface(freeAgentsPage, leaguePage);

    // Now follow a deep link (copy URL / Android intent) to the player detail
    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText(`${PLAYER_FIRST} ${PLAYER_LAST}`);
  });

  test('player detail modal shows stats when reached via deep link from FA context', async ({
    page,
    freeAgentsPage,
    leaguePage,
    playersPage,
  }) => {
    await installFreeAgentsMocks(page);
    await installPlayerDetailMocks(page);

    await openFreeAgentsSurface(freeAgentsPage, leaguePage);

    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Stats should load and hero stat chips should be visible
    await playersPage.detail.expectText('HR');
    await playersPage.detail.expectText('RBI');
  });
});

// ── Tests: deep link from draft board ────────────────────────────────────────

/**
 * Runs at both desktop and phone-width projects (LS-9732 removed the
 * `DESKTOP_VIEWPORT` pin LS-9712 left here). `useDraftViewportTier()` swaps
 * in `CompactLiveDraftBoard` -> `DraftPlayersTab` on its `phone` tier (below
 * 800px) in place of the wide `DraftPlayerBoard` (`draft-board` root), so the
 * "draft mocks are wired and the player pool rendered" gate below branches on
 * viewport width to wait on the surface that tier actually shows. The deep
 * link itself (`playersPage.gotoDetail`) is identical either way — neither
 * board is the thing under test past that gate. Compact board's own
 * affordances (search/chips/queue/draft-button) get dedicated coverage in
 * `compact-draft-board.spec.ts`.
 */
test.describe('Player Detail Deep Link — from Draft Board @regression', () => {
  test('player in draft pool can be deep-linked from draft board context', async ({
    page,
    playersPage,
  }) => {
    await installDraftMocks(page);
    await installPlayerDetailMocks(page);

    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    // Wait for the draft board to render with the player pool — which board
    // depends on viewport width (useDraftViewportTier's `phone` tier).
    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth < 800) {
      await page.getByTestId('draft-bottom-nav-players').click();
      await page.waitForSelector('[data-testid="draft-players-row"]', {
        timeout: 15000,
      });
    } else {
      await page.waitForSelector('[data-testid="draft-board"]', {
        timeout: 15000,
      });
    }

    // Verify the player appears in the pool — confirms draft mocks are wired correctly
    const playerName = `${PLAYER_FIRST} ${PLAYER_LAST}`;
    await page.waitForSelector(`text=${playerName}`, { timeout: 10000 });

    // Navigate to the player detail URL (simulates the deep-link a user follows
    // from the draft board, e.g. copying a player URL or using an Android intent)
    await playersPage.gotoDetail(PLAYER_ID);

    // The player detail modal should be open
    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText(`${PLAYER_FIRST} ${PLAYER_LAST}`);
  });

  test('URL deep link to /players/:id from draft context opens player modal', async ({
    page,
    playersPage,
  }) => {
    await installPlayerDetailMocks(page);

    // Simulate a user who copies a player URL while on the draft board
    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText(`${PLAYER_FIRST} ${PLAYER_LAST}`);
  });
});

// ── Tests: deep link from matchup detail ─────────────────────────────────────

test.describe('Player Detail Deep Link — from Matchup @regression', () => {
  test('URL deep link to /players/:id from matchup context opens player modal', async ({
    page,
    matchupPage,
    playersPage,
  }) => {
    await installMatchupMocks(page);
    await installPlayerDetailMocks(page);

    // Navigate to the matchup surface first (simulates the browsing context)
    await openMatchupSurface(matchupPage);

    // Follow a deep link to the player detail (from sharing or Android intent)
    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText(`${PLAYER_FIRST} ${PLAYER_LAST}`);
  });

  test('player detail modal loads career stats when reached from matchup deep link', async ({
    page,
    matchupPage,
    playersPage,
  }) => {
    await installMatchupMocks(page);
    await installPlayerDetailMocks(page);

    await openMatchupSurface(matchupPage);

    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Eligible positions and career stats should be visible
    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectText('OF', { exact: true });
  });
});

// ── Tests: back navigation from deep link ────────────────────────────────────

test.describe('Player Detail Deep Link — back navigation @regression', () => {
  test('back button from a direct /players/:id deep link returns to /players', async ({
    page,
    playersPage,
  }) => {
    await installPlayerDetailMocks(page);

    // Simulate an Android intent / share-link opening /players/:id with no prior history
    await playersPage.gotoDetail(PLAYER_ID);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectBackButton();

    // Back from a cold deep link falls back to /players (LS-9076 — the
    // canonical stats route, formerly /players/stats)
    await playersPage.detail.back();
    await playersPage.detail.waitForStatsList();
  });
});
