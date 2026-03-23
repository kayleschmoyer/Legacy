import { expect, test } from '../fixtures/api';
import { graphqlOk } from '../helpers/graphql';

/**
 * Playoff bracket integration test: exercises league creation through
 * playoff bracket creation, round advancement, and championship award.
 *
 * Uses a 4-team league with playoffEnabled: true and a short 2-week
 * regular season so playoffs are triggered after week 2 advancement.
 *
 * Prerequisites:
 *   - Local GraphQL server running (`pnpm exec nx serve db`)
 *   - Docker Postgres with seeded player data
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/playoff-bracket.integration.spec.ts
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GAMES_PER_MATCHUP = 2;
const TOTAL_MATCHUPS = 2; // 2-week regular season

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests
// ---------------------------------------------------------------------------
interface PlayoffState {
  leagueId: number;
  inviteCode: string;
  teams: Array<{ id: number; name: string }>;
  draftId: number;
  draftTeamOrder: number[];
  availablePlayers: Array<{ id: number; firstName: string; lastName: string }>;
  bracketId: number;
  playoffMatchups: Array<{
    id: number;
    round: string;
    matchupNumber: number;
    highSeedTeamId: number | null;
    lowSeedTeamId: number | null;
  }>;
}

const LEAGUE_FIELDS = `id name draftStatus currentWeek inviteCode playoffEnabled`;

let state: PlayoffState;

// ---------------------------------------------------------------------------
// The serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Playoff Initiation & Bracket Progression @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      teams: [],
      draftId: 0,
      draftTeamOrder: [],
      availablePlayers: [],
      bracketId: 0,
      playoffMatchups: [],
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — LEAGUE CREATION (4 teams, playoffs enabled)
  // -----------------------------------------------------------------------

  test('Phase 1: Create league with playoffs enabled', async ({
    api,
    api2,
    apiCommissioner,
  }) => {
    state.teams = [];

    await test.step('1.1 Commissioner creates 4-team league', async () => {
      const data = await graphqlOk<{
        createLeagueAndTeams: {
          league: {
            id: number;
            name: string;
            inviteCode: string;
            playoffEnabled: boolean;
          };
          teams: Array<{ id: number; name: string }>;
        };
      }>(
        apiCommissioner,
        `mutation CreateLeague($input: CreateLeagueAndTeamsInput!) {
             createLeagueAndTeams(input: $input) {
               league { ${LEAGUE_FIELDS} }
               teams { id name }
             }
           }`,
        {
          input: {
            leagueName: 'Playoff Integration Test League',
            numberOfTeams: 4,
            playerPool: 'all',
          },
        },
      );

      state.leagueId = Number(data.createLeagueAndTeams.league.id);
      state.inviteCode = data.createLeagueAndTeams.league.inviteCode;
      expect(state.leagueId).toBeGreaterThan(0);
      expect(state.inviteCode).toBeTruthy();

      // Commissioner's team is auto-created
      const commTeam = data.createLeagueAndTeams.teams[0];
      if (commTeam) {
        state.teams.push({
          id: Number(commTeam.id),
          name: commTeam.name,
        });
      }
    });

    await test.step('1.2 Configure league settings for playoffs', async () => {
      await graphqlOk(
        apiCommissioner,
        `mutation UpdateSettings($input: UpdateLeagueSettingsInput!) {
             updateLeagueSettings(input: $input) { ${LEAGUE_FIELDS} }
           }`,
        {
          input: {
            leagueId: state.leagueId,
            gamesPerMatchup: GAMES_PER_MATCHUP,
            totalMatchups: TOTAL_MATCHUPS,
            playoffEnabled: true,
            playoffFormat: '4-team',
          },
        },
      );
    });

    await test.step('1.3 Manager 1 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
           joinLeague(inviteCode: $inviteCode, teamName: $teamName) { teamId }
         }`,
        { inviteCode: state.inviteCode, teamName: 'The Batters' },
      );
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'The Batters',
      });
    });

    await test.step('1.4 Manager 2 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api2,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
           joinLeague(inviteCode: $inviteCode, teamName: $teamName) { teamId }
         }`,
        { inviteCode: state.inviteCode, teamName: 'The Pitchers' },
      );
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'The Pitchers',
      });
    });

    await test.step('1.5 Verify league has playoffs enabled', async () => {
      const data = await graphqlOk<{
        league: {
          playoffEnabled: boolean;
          draftStatus: string;
        };
      }>(
        api,
        `query GetLeague($id: Int!) {
           league(id: $id) { ${LEAGUE_FIELDS} }
         }`,
        { id: state.leagueId },
      );
      expect(data.league.playoffEnabled).toBe(true);
      expect(data.league.draftStatus).toBe('not-started');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — DRAFT (commissioner picks for all teams)
  // -----------------------------------------------------------------------

  test('Phase 2: Complete draft', async ({ api, apiCommissioner }) => {
    await test.step('2.1 Initialize draft', async () => {
      const data = await graphqlOk<{
        initializeDraft: { id: number };
      }>(
        apiCommissioner,
        `mutation InitDraft(
           $leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String
         ) {
           initializeDraft(
             leagueId: $leagueId, draftMode: $draftMode,
             selectionMethod: $selectionMethod, draftOrder: $draftOrder
           ) { id draftMode selectionMethod }
         }`,
        {
          leagueId: state.leagueId,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
        },
      );
      state.draftId = Number(data.initializeDraft.id);
      expect(state.draftId).toBeGreaterThan(0);
    });

    await test.step('2.2 Randomize draft order', async () => {
      const data = await graphqlOk<{
        randomizeDraftOrder: { id: number };
      }>(
        apiCommissioner,
        `mutation RandomizeOrder($draftId: Int!) {
           randomizeDraftOrder(draftId: $draftId) { id }
         }`,
        { draftId: state.draftId },
      );
      expect(data.randomizeDraftOrder.id).toBe(state.draftId);

      const orderData = await graphqlOk<{
        getDraftTeamOrder: Array<{ teamId: number; draftOrder: number }>;
      }>(
        api,
        `query DraftOrder($draftId: Int!) {
           getDraftTeamOrder(draftId: $draftId) { teamId draftOrder }
         }`,
        { draftId: state.draftId },
      );
      state.draftTeamOrder = orderData.getDraftTeamOrder.map((e) => e.teamId);
    });

    await test.step('2.3 Fetch available players', async () => {
      const data = await graphqlOk<{
        getAvailableDraftPlayers: Array<{
          id: number;
          firstName: string;
          lastName: string;
        }>;
      }>(
        api,
        `query AvailablePlayers($draftId: Int!) {
           getAvailableDraftPlayers(draftId: $draftId) { id firstName lastName }
         }`,
        { draftId: state.draftId },
      );
      state.availablePlayers = data.getAvailableDraftPlayers;
      expect(state.availablePlayers.length).toBeGreaterThan(0);
    });

    await test.step('2.4 Start draft', async () => {
      const data = await graphqlOk<{
        startDraft: { id: number; draftStatus: string };
      }>(
        apiCommissioner,
        `mutation StartDraft($leagueId: Int!) {
           startDraft(leagueId: $leagueId) { id draftStatus }
         }`,
        { leagueId: state.leagueId },
      );
      expect(['in-progress', 'queued']).toContain(data.startDraft.draftStatus);
    });

    await test.step('2.5 Poll until draft is in-progress', async () => {
      await expect
        .poll(
          async () => {
            const r = await graphqlOk<{
              league: { draftStatus: string };
            }>(api, `query { league(id: ${state.leagueId}) { draftStatus } }`);
            return r.league.draftStatus;
          },
          {
            timeout: 60_000,
            intervals: [1_000, 2_000, 5_000],
            message: 'Draft did not reach in-progress',
          },
        )
        .toBe('in-progress');
    });

    await test.step('2.6 Commissioner picks all rounds', async () => {
      const numTeams = state.draftTeamOrder.length;
      const rounds = 4; // 4 rounds of picks
      let playerIdx = 0;

      for (let round = 0; round < rounds; round++) {
        for (let t = 0; t < numTeams; t++) {
          if (playerIdx >= state.availablePlayers.length) break;

          await graphqlOk(
            apiCommissioner,
            `mutation Pick($draftId: Int!, $playerId: Int!) {
               commissionerPick(draftId: $draftId, playerId: $playerId) {
                 id playerId teamId
               }
             }`,
            {
              draftId: state.draftId,
              playerId: state.availablePlayers[playerIdx].id,
            },
          );
          playerIdx++;
        }
      }
    });

    await test.step('2.7 Poll until draft is completed', async () => {
      await expect
        .poll(
          async () => {
            const r = await graphqlOk<{
              league: { draftStatus: string };
            }>(api, `query { league(id: ${state.leagueId}) { draftStatus } }`);
            return r.league.draftStatus;
          },
          {
            timeout: 60_000,
            intervals: [1_000, 2_000, 5_000],
            message: 'Draft did not reach completed',
          },
        )
        .toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — CREATE MATCHUPS & REGULAR SEASON
  // -----------------------------------------------------------------------

  test('Phase 3: Regular season — create matchups and play', async ({
    api,
    apiCommissioner,
  }) => {
    await test.step('3.1 Create all matchups', async () => {
      const data = await graphqlOk<{
        createAllMatchups: {
          matchups: Array<{ id: number; weekNumber: number; status: string }>;
        };
      }>(
        apiCommissioner,
        `mutation CreateMatchups($leagueId: Int!) {
           createAllMatchups(leagueId: $leagueId) {
             matchups { id weekNumber status }
             currentMatchupId
           }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.createAllMatchups.matchups.length).toBeGreaterThan(0);
    });

    await test.step('3.2 Verify week 1 matchups in progress', async () => {
      const data = await graphqlOk<{
        getMatchupsByWeek: Array<{
          id: number;
          weekNumber: number;
          status: string;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int!) {
           getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
             id weekNumber status
           }
         }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );
      expect(data.getMatchupsByWeek.length).toBeGreaterThan(0);
      expect(data.getMatchupsByWeek[0].status).toBe('in_progress');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — WEEK 1: select games, advance
  // -----------------------------------------------------------------------

  test('Phase 4: Week 1 — select games and advance', async ({
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

    await test.step('4.1 Auto-select games for week 1', async () => {
      const data = await graphqlOk<{
        autoSelectGames: { processedCount: number };
      }>(
        apiCommissioner,
        `mutation AutoSelect($leagueId: Int) {
           autoSelectGames(leagueId: $leagueId) { processedCount }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoSelectGames).toBeTruthy();
    });

    await test.step('4.2 Wait for stats to load for week 1', async () => {
      // Poll until all matchups for week 1 have stats loaded
      await expect
        .poll(
          async () => {
            const data = await graphqlOk<{
              getMatchupsByWeek: Array<{
                id: number;
                team1Score: number | null;
                team2Score: number | null;
              }>;
            }>(
              apiCommissioner,
              `query Matchups($leagueId: Int!, $weekNumber: Int!) {
                   getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
                     id team1Score team2Score
                   }
                 }`,
              { leagueId: state.leagueId, weekNumber: 1 },
            );
            // All matchups should have both scores populated
            return data.getMatchupsByWeek.every(
              (m) => m.team1Score !== null && m.team2Score !== null,
            );
          },
          {
            timeout: 180_000,
            intervals: [5_000, 10_000, 15_000],
            message: 'Week 1 stats did not finish loading',
          },
        )
        .toBe(true);
    });

    await test.step('4.3 Auto-advance matchups (week 1)', async () => {
      const data = await graphqlOk<{
        autoAdvanceMatchups: { advancedCount: number };
      }>(
        apiCommissioner,
        `mutation AutoAdvance($leagueId: Int) {
           autoAdvanceMatchups(leagueId: $leagueId) { advancedCount }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoAdvanceMatchups).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — WEEK 2 (final regular season): select games, advance
  //   After this advance, the system should create the playoff bracket
  // -----------------------------------------------------------------------

  test('Phase 5: Week 2 (final) — select games, advance triggers playoffs', async ({
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

    await test.step('5.1 Auto-select games for week 2', async () => {
      const data = await graphqlOk<{
        autoSelectGames: { processedCount: number };
      }>(
        apiCommissioner,
        `mutation AutoSelect($leagueId: Int) {
           autoSelectGames(leagueId: $leagueId) { processedCount }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoSelectGames).toBeTruthy();
    });

    await test.step('5.2 Wait for stats to load for week 2', async () => {
      await expect
        .poll(
          async () => {
            const data = await graphqlOk<{
              getMatchupsByWeek: Array<{
                id: number;
                team1Score: number | null;
                team2Score: number | null;
              }>;
            }>(
              apiCommissioner,
              `query Matchups($leagueId: Int!, $weekNumber: Int!) {
                   getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
                     id team1Score team2Score
                   }
                 }`,
              { leagueId: state.leagueId, weekNumber: 2 },
            );
            return data.getMatchupsByWeek.every(
              (m) => m.team1Score !== null && m.team2Score !== null,
            );
          },
          {
            timeout: 180_000,
            intervals: [5_000, 10_000, 15_000],
            message: 'Week 2 stats did not finish loading',
          },
        )
        .toBe(true);
    });

    await test.step('5.3 Auto-advance matchups (triggers playoff bracket creation)', async () => {
      const data = await graphqlOk<{
        autoAdvanceMatchups: {
          advancedCount: number;
          leaguesAdvanced: number;
        };
      }>(
        apiCommissioner,
        `mutation AutoAdvance($leagueId: Int) {
             autoAdvanceMatchups(leagueId: $leagueId) {
               advancedCount leaguesAdvanced
             }
           }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoAdvanceMatchups).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — VERIFY PLAYOFF BRACKET CREATED
  // -----------------------------------------------------------------------

  test('Phase 6: Verify playoff bracket and seeds', async ({ api }) => {
    await test.step('6.1 Query playoff bracket for league', async () => {
      // Poll briefly — bracket creation is synchronous within
      // autoAdvanceMatchups but the query may need a moment
      const data = await graphqlOk<{
        getPlayoffBracket: {
          id: number;
          leagueId: number;
          format: string;
          startWeek: number;
          status: string;
          matchups: Array<{
            id: number;
            round: string;
            matchupNumber: number;
            highSeedTeamId: number | null;
            lowSeedTeamId: number | null;
            weekNumber: number;
            status: string;
          }>;
        } | null;
      }>(
        api,
        `query GetBracket($leagueId: Int!) {
             getPlayoffBracket(leagueId: $leagueId) {
               id leagueId format startWeek status
               matchups {
                 id round matchupNumber highSeedTeamId lowSeedTeamId
                 weekNumber status
               }
             }
           }`,
        { leagueId: state.leagueId },
      );

      expect(data.getPlayoffBracket).not.toBeNull();
      // eslint guards ensure bracket is defined after the assertion
      const bracket = data.getPlayoffBracket;
      if (!bracket) throw new Error('Bracket unexpectedly null');

      expect(bracket.format).toBe('4-team');
      expect(bracket.startWeek).toBe(TOTAL_MATCHUPS + 1); // week 3
      expect(bracket.status).toBe('in_progress');

      state.bracketId = Number(bracket.id);
      state.playoffMatchups = bracket.matchups.map((m) => ({
        id: Number(m.id),
        round: m.round,
        matchupNumber: m.matchupNumber,
        highSeedTeamId: m.highSeedTeamId,
        lowSeedTeamId: m.lowSeedTeamId,
      }));

      // 4-team bracket should have 2 semifinals + 1 finals = 3 matchups
      expect(bracket.matchups.length).toBeGreaterThanOrEqual(3);

      // Semifinals should have teams assigned based on standings seeding
      const semis = bracket.matchups.filter((m) => m.round === 'semifinals');
      expect(semis.length).toBe(2);

      for (const semi of semis) {
        expect(semi.highSeedTeamId).not.toBeNull();
        expect(semi.lowSeedTeamId).not.toBeNull();
        expect(semi.weekNumber).toBe(TOTAL_MATCHUPS + 1);
      }
    });

    await test.step('6.2 Query playoff seeds', async () => {
      const data = await graphqlOk<{
        getPlayoffSeeds: Array<{
          seedNumber: number;
          teamId: number;
          regularSeasonWins: number;
          regularSeasonLosses: number;
        }>;
      }>(
        api,
        `query GetSeeds($bracketId: Int!) {
           getPlayoffSeeds(bracketId: $bracketId) {
             seedNumber teamId regularSeasonWins regularSeasonLosses
           }
         }`,
        { bracketId: state.bracketId },
      );

      expect(data.getPlayoffSeeds.length).toBe(4);

      // Seeds should be ordered 1-4
      const seedNumbers = data.getPlayoffSeeds.map((s) => s.seedNumber);
      expect(seedNumbers).toEqual([1, 2, 3, 4]);

      // Seed 1 should have >= wins of seed 4
      const seed1 = data.getPlayoffSeeds.find((s) => s.seedNumber === 1);
      const seed4 = data.getPlayoffSeeds.find((s) => s.seedNumber === 4);
      if (!seed1 || !seed4) throw new Error('Missing seed 1 or seed 4');
      expect(seed1.regularSeasonWins).toBeGreaterThanOrEqual(
        seed4.regularSeasonWins,
      );
    });

    await test.step('6.3 Verify regular matchups created for playoff week', async () => {
      // autoAdvanceMatchups creates regular matchups for scoring alongside
      // the playoff bracket
      const data = await graphqlOk<{
        getMatchupsByWeek: Array<{
          id: number;
          weekNumber: number;
          status: string;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int!) {
           getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
             id weekNumber status
           }
         }`,
        { leagueId: state.leagueId, weekNumber: TOTAL_MATCHUPS + 1 },
      );

      // Should have matchups created for the playoff week
      expect(data.getMatchupsByWeek.length).toBeGreaterThan(0);
    });

    await test.step('6.4 Verify standings reflect regular season results', async () => {
      const data = await graphqlOk<{
        getLeagueStandings: Array<{
          teamId: number;
          wins: number;
          losses: number;
          rank: number;
        }>;
      }>(
        api,
        `query Standings($leagueId: Int!) {
             getLeagueStandings(leagueId: $leagueId) {
               teamId wins losses rank
             }
           }`,
        { leagueId: state.leagueId },
      );

      expect(data.getLeagueStandings.length).toBeGreaterThan(0);

      // Each team should have played 2 weeks of matchups
      for (const standing of data.getLeagueStandings) {
        expect(standing.wins + standing.losses).toBeGreaterThanOrEqual(
          TOTAL_MATCHUPS,
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — PLAYOFF SEMIFINALS: select games, load stats, advance
  // -----------------------------------------------------------------------

  test('Phase 7: Playoff semifinals — score and advance', async ({
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

    const playoffWeek = TOTAL_MATCHUPS + 1;

    await test.step('7.1 Auto-select games for playoff week', async () => {
      const data = await graphqlOk<{
        autoSelectGames: { processedCount: number };
      }>(
        apiCommissioner,
        `mutation AutoSelect($leagueId: Int) {
             autoSelectGames(leagueId: $leagueId) { processedCount }
           }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoSelectGames).toBeTruthy();
    });

    await test.step('7.2 Wait for playoff week stats to load', async () => {
      await expect
        .poll(
          async () => {
            const data = await graphqlOk<{
              getMatchupsByWeek: Array<{
                id: number;
                team1Score: number | null;
                team2Score: number | null;
              }>;
            }>(
              apiCommissioner,
              `query Matchups($leagueId: Int!, $weekNumber: Int!) {
                   getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
                     id team1Score team2Score
                   }
                 }`,
              { leagueId: state.leagueId, weekNumber: playoffWeek },
            );
            return data.getMatchupsByWeek.every(
              (m) => m.team1Score !== null && m.team2Score !== null,
            );
          },
          {
            timeout: 180_000,
            intervals: [5_000, 10_000, 15_000],
            message: 'Playoff week stats did not finish loading',
          },
        )
        .toBe(true);
    });

    await test.step('7.3 Update playoff matchup scores from regular matchup scores', async () => {
      // Get the regular matchup scores for the playoff week
      const matchupsData = await graphqlOk<{
        getMatchupsByWeek: Array<{
          id: number;
          team1Id: number;
          team2Id: number;
          team1Score: number;
          team2Score: number;
        }>;
      }>(
        apiCommissioner,
        `query Matchups($leagueId: Int!, $weekNumber: Int!) {
             getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
               id team1Id team2Id team1Score team2Score
             }
           }`,
        { leagueId: state.leagueId, weekNumber: playoffWeek },
      );

      // Update each semifinal playoff matchup with corresponding scores
      const semis = state.playoffMatchups.filter(
        (m) => m.round === 'semifinals',
      );

      for (const semi of semis) {
        // Find the matching regular matchup by team pairing
        const regularMatchup = matchupsData.getMatchupsByWeek.find(
          (rm) =>
            (rm.team1Id === semi.highSeedTeamId &&
              rm.team2Id === semi.lowSeedTeamId) ||
            (rm.team1Id === semi.lowSeedTeamId &&
              rm.team2Id === semi.highSeedTeamId),
        );

        if (regularMatchup) {
          // Map scores correctly: highSeed and lowSeed
          const highSeedScore =
            regularMatchup.team1Id === semi.highSeedTeamId
              ? regularMatchup.team1Score
              : regularMatchup.team2Score;
          const lowSeedScore =
            regularMatchup.team1Id === semi.lowSeedTeamId
              ? regularMatchup.team1Score
              : regularMatchup.team2Score;

          await graphqlOk(
            apiCommissioner,
            `mutation UpdatePlayoffMatchup(
                 $matchupId: Int!, $highSeedScore: Float, $lowSeedScore: Float
               ) {
                 updatePlayoffMatchup(
                   matchupId: $matchupId,
                   highSeedScore: $highSeedScore,
                   lowSeedScore: $lowSeedScore
                 ) { id status winnerTeamId highSeedScore lowSeedScore }
               }`,
            {
              matchupId: semi.id,
              highSeedScore,
              lowSeedScore,
            },
          );
        } else {
          // If no matching regular matchup, set explicit scores so
          // the high seed advances
          await graphqlOk(
            apiCommissioner,
            `mutation UpdatePlayoffMatchup(
                 $matchupId: Int!, $highSeedScore: Float, $lowSeedScore: Float
               ) {
                 updatePlayoffMatchup(
                   matchupId: $matchupId,
                   highSeedScore: $highSeedScore,
                   lowSeedScore: $lowSeedScore
                 ) { id status winnerTeamId }
               }`,
            {
              matchupId: semi.id,
              highSeedScore: 10.0,
              lowSeedScore: 5.0,
            },
          );
        }
      }
    });

    await test.step('7.4 Advance playoff bracket past semifinals', async () => {
      const data = await graphqlOk<{
        advancePlayoffBracket: {
          id: number;
          status: string;
          matchups: Array<{
            id: number;
            round: string;
            highSeedTeamId: number | null;
            lowSeedTeamId: number | null;
            winnerTeamId: number | null;
            status: string;
          }>;
        };
      }>(
        apiCommissioner,
        `mutation AdvanceBracket($bracketId: Int!) {
           advancePlayoffBracket(bracketId: $bracketId) {
             id status
             matchups {
               id round highSeedTeamId lowSeedTeamId winnerTeamId status
             }
           }
         }`,
        { bracketId: state.bracketId },
      );

      // Bracket should still be in_progress (finals remain)
      expect(data.advancePlayoffBracket.status).toBe('in_progress');

      // Semifinals should now be completed with winners
      const completedSemis = data.advancePlayoffBracket.matchups.filter(
        (m) => m.round === 'semifinals' && m.status === 'completed',
      );
      expect(completedSemis.length).toBe(2);

      for (const semi of completedSemis) {
        expect(semi.winnerTeamId).not.toBeNull();
      }

      // Finals matchup should now have teams populated
      const finals = data.advancePlayoffBracket.matchups.filter(
        (m) => m.round === 'finals',
      );
      expect(finals.length).toBe(1);
      expect(finals[0].highSeedTeamId).not.toBeNull();
      expect(finals[0].lowSeedTeamId).not.toBeNull();

      // Update state with finals matchup
      state.playoffMatchups = data.advancePlayoffBracket.matchups.map((m) => ({
        id: Number(m.id),
        round: m.round,
        matchupNumber: 0,
        highSeedTeamId: m.highSeedTeamId,
        lowSeedTeamId: m.lowSeedTeamId,
      }));
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — PLAYOFF FINALS: score and determine champion
  // -----------------------------------------------------------------------

  test('Phase 8: Playoff finals — crown champion', async ({
    apiCommissioner,
  }) => {
    await test.step('8.1 Score the finals matchup', async () => {
      const finals = state.playoffMatchups.find((m) => m.round === 'finals');
      if (!finals) throw new Error('Finals matchup not found in state');

      // Set explicit scores — high seed wins the championship
      await graphqlOk(
        apiCommissioner,
        `mutation UpdatePlayoffMatchup(
           $matchupId: Int!, $highSeedScore: Float, $lowSeedScore: Float
         ) {
           updatePlayoffMatchup(
             matchupId: $matchupId,
             highSeedScore: $highSeedScore,
             lowSeedScore: $lowSeedScore
           ) { id status winnerTeamId highSeedScore lowSeedScore }
         }`,
        {
          matchupId: finals.id,
          highSeedScore: 12.5,
          lowSeedScore: 8.0,
        },
      );
    });

    await test.step('8.2 Advance bracket — should complete', async () => {
      const data = await graphqlOk<{
        advancePlayoffBracket: {
          id: number;
          status: string;
          championTeamId: number | null;
          matchups: Array<{
            id: number;
            round: string;
            winnerTeamId: number | null;
            status: string;
          }>;
        };
      }>(
        apiCommissioner,
        `mutation AdvanceBracket($bracketId: Int!) {
             advancePlayoffBracket(bracketId: $bracketId) {
               id status championTeamId
               matchups { id round winnerTeamId status }
             }
           }`,
        { bracketId: state.bracketId },
      );

      expect(data.advancePlayoffBracket.status).toBe('completed');
      expect(data.advancePlayoffBracket.championTeamId).not.toBeNull();

      // All matchups should be completed
      for (const m of data.advancePlayoffBracket.matchups) {
        expect(m.status).toBe('completed');
        expect(m.winnerTeamId).not.toBeNull();
      }
    });

    await test.step('8.3 Award championship trophy', async () => {
      const data = await graphqlOk<{
        awardChampionship: {
          id: number;
          leagueId: number;
          teamId: number;
          finalScore: number;
          runnerUpTeamId: number | null;
        };
      }>(
        apiCommissioner,
        `mutation AwardChampionship($bracketId: Int!) {
           awardChampionship(bracketId: $bracketId) {
             id leagueId teamId finalScore runnerUpTeamId
           }
         }`,
        { bracketId: state.bracketId },
      );

      expect(data.awardChampionship.leagueId).toBe(state.leagueId);
      expect(data.awardChampionship.teamId).toBeGreaterThan(0);
      expect(data.awardChampionship.finalScore).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 9 — FINAL VERIFICATION
  // -----------------------------------------------------------------------

  test('Phase 9: Verify completed season and trophy', async ({ api }) => {
    await test.step('9.1 Verify bracket is completed with champion', async () => {
      const data = await graphqlOk<{
        getPlayoffBracket: {
          id: number;
          status: string;
          championTeamId: number | null;
          format: string;
        } | null;
      }>(
        api,
        `query GetBracket($leagueId: Int!) {
             getPlayoffBracket(leagueId: $leagueId) {
               id status championTeamId format
             }
           }`,
        { leagueId: state.leagueId },
      );

      const finalBracket = data.getPlayoffBracket;
      if (!finalBracket) throw new Error('Bracket unexpectedly null');
      expect(finalBracket.status).toBe('completed');
      expect(finalBracket.championTeamId).not.toBeNull();
      expect(finalBracket.format).toBe('4-team');
    });

    await test.step('9.2 Verify championship trophy exists', async () => {
      const data = await graphqlOk<{
        getChampionshipTrophies: Array<{
          id: number;
          leagueId: number;
          teamId: number;
          finalScore: number;
          runnerUpTeamId: number | null;
        }>;
      }>(
        api,
        `query GetTrophies($leagueId: Int!) {
           getChampionshipTrophies(leagueId: $leagueId) {
             id leagueId teamId finalScore runnerUpTeamId
           }
         }`,
        { leagueId: state.leagueId },
      );

      expect(data.getChampionshipTrophies.length).toBeGreaterThanOrEqual(1);
      const trophy = data.getChampionshipTrophies[0];
      expect(trophy.leagueId).toBe(state.leagueId);
      expect(trophy.teamId).toBeGreaterThan(0);
    });

    await test.step('9.3 Verify all regular season matchups completed', async () => {
      for (let week = 1; week <= TOTAL_MATCHUPS; week++) {
        const data = await graphqlOk<{
          getMatchupsByWeek: Array<{
            id: number;
            status: string;
          }>;
        }>(
          api,
          `query Matchups($leagueId: Int!, $weekNumber: Int!) {
               getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
                 id status
               }
             }`,
          { leagueId: state.leagueId, weekNumber: week },
        );

        for (const matchup of data.getMatchupsByWeek) {
          expect(matchup.status).toBe('completed');
        }
      }
    });
  });
});
