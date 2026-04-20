/**
 * Season Lifecycle Integration Test (LS-1646)
 *
 * Drives a full regular season end-to-end via direct GraphQL mutations instead
 * of waiting for cron schedules. Creates a league with minimal settings
 * (gamesPerMatchup: 2, totalMatchups: 2) to keep the run fast.
 *
 * Flow:
 *   1. Create league + teams via API
 *   2. Complete the draft via commissioner picks
 *   3. For each week (1..totalMatchups):
 *      a. For each game (1..gamesPerMatchup):
 *         - autoSelectGames(leagueId)
 *         - waitForAllMatchupsStatsLoaded
 *         - Assert matchup_player_games records created with valid game_identifier
 *      b. autoAdvanceMatchups(leagueId)
 *      c. Assert current week incremented, matchup statuses correct
 *   4. After final week: assert all matchups completed
 *
 * Prerequisites:
 *   - Live GraphQL server running
 *   - Docker Postgres with seeded player data
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/season-lifecycle.integration.spec.ts
 */

import { expect, test } from '../fixtures/api';
import { graphqlOk } from '../helpers/graphql';
import { waitForAllMatchupsStatsLoaded } from '../helpers/wait-for-stats-loaded';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAMES_PER_MATCHUP = 2;
const TOTAL_MATCHUPS = 2;

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests
// ---------------------------------------------------------------------------

interface SeasonLifecycleState {
  leagueId: number;
  inviteCode: string;
  teams: Array<{ id: number; name: string }>;
  draftId: number;
  draftTeamOrder: number[];
  availablePlayers: Array<{ id: number; firstName: string; lastName: string }>;
}

let state: SeasonLifecycleState;

// ---------------------------------------------------------------------------
// The serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Season Lifecycle via Direct Mutations @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      teams: [],
      draftId: 0,
      draftTeamOrder: [],
      availablePlayers: [],
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — LEAGUE CREATION
  // -----------------------------------------------------------------------

  test('Phase 1: Create league and join teams', async ({
    api,
    api2,
    apiCommissioner,
  }) => {
    test.setTimeout(120_000);

    await test.step('1.1 Commissioner creates league', async () => {
      const data = await graphqlOk<{
        createLeagueAndTeams: {
          league: { id: number; name: string; inviteCode: string };
          teams: Array<{ id: number; name: string }>;
        };
      }>(
        apiCommissioner,
        `mutation CreateLeague($input: CreateLeagueAndTeamsInput!) {
             createLeagueAndTeams(input: $input) {
               league { id name inviteCode draftStatus currentWeek }
               teams { id name }
             }
           }`,
        {
          input: {
            leagueName: 'Season Lifecycle Integration Test',
            numberOfTeams: 3,
            numberOfDivisions: 1,
            maxRosterSize: 4,
            playerPool: 'all',
          },
        },
      );
      state.leagueId = Number(data.createLeagueAndTeams.league.id);
      state.inviteCode = data.createLeagueAndTeams.league.inviteCode;
      expect(state.leagueId).toBeGreaterThan(0);
      expect(state.inviteCode).toBeTruthy();
    });

    await test.step('1.2 Configure league for fast season (low matchup counts)', async () => {
      const data = await graphqlOk<{
        updateLeagueSettings: {
          gamesPerMatchup: number;
          totalMatchups: number;
        };
      }>(
        apiCommissioner,
        `mutation UpdateSettings($input: UpdateLeagueSettingsInput!) {
               updateLeagueSettings(input: $input) {
                 gamesPerMatchup totalMatchups
               }
             }`,
        {
          input: {
            leagueId: state.leagueId,
            gamesPerMatchup: GAMES_PER_MATCHUP,
            totalMatchups: TOTAL_MATCHUPS,
          },
        },
      );
      expect(data.updateLeagueSettings.gamesPerMatchup).toBe(GAMES_PER_MATCHUP);
      expect(data.updateLeagueSettings.totalMatchups).toBe(TOTAL_MATCHUPS);
    });

    await test.step('1.3 Manager 1 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
             joinLeague(inviteCode: $inviteCode, teamName: $teamName) {
               teamId
             }
           }`,
        { inviteCode: state.inviteCode, teamName: 'Lifecycle Sluggers' },
      );
      expect(data.joinLeague.teamId).toBeGreaterThan(0);
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'Lifecycle Sluggers',
      });
    });

    await test.step('1.4 Manager 2 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api2,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
             joinLeague(inviteCode: $inviteCode, teamName: $teamName) {
               teamId
             }
           }`,
        { inviteCode: state.inviteCode, teamName: 'Lifecycle Aces' },
      );
      expect(data.joinLeague.teamId).toBeGreaterThan(0);
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'Lifecycle Aces',
      });
    });

    await test.step('1.5 Verify league pre-draft state', async () => {
      const data = await graphqlOk<{
        league: {
          draftStatus: string;
          gamesPerMatchup: number;
          totalMatchups: number;
        };
      }>(
        api,
        `query GetLeague($id: Int!) {
             league(id: $id) { draftStatus gamesPerMatchup totalMatchups }
           }`,
        { id: state.leagueId },
      );
      expect(data.league.draftStatus).toBe('not-started');
      expect(data.league.gamesPerMatchup).toBe(GAMES_PER_MATCHUP);
      expect(data.league.totalMatchups).toBe(TOTAL_MATCHUPS);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — DRAFT COMPLETION
  // -----------------------------------------------------------------------

  test('Phase 2: Complete the draft', async ({ api, apiCommissioner }) => {
    test.setTimeout(240_000);

    await test.step('2.1 Initialize draft', async () => {
      const data = await graphqlOk<{
        initializeDraft: { id: number; draftMode: string };
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
      await graphqlOk(
        apiCommissioner,
        `mutation RandomizeOrder($draftId: Int!) {
             randomizeDraftOrder(draftId: $draftId) { id }
           }`,
        { draftId: state.draftId },
      );

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
             getAvailableDraftPlayers(draftId: $draftId) {
               id firstName lastName
             }
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

    await test.step('2.6 Make all draft picks via commissioner', async () => {
      const numTeams = state.draftTeamOrder.length;
      // 4 rounds of picks to build a roster
      const totalRounds = 4;
      let playerIdx = 0;

      for (let round = 0; round < totalRounds; round++) {
        for (let t = 0; t < numTeams; t++) {
          if (playerIdx >= state.availablePlayers.length) break;
          await graphqlOk<{
            commissionerPick: { playerId: number; teamId: number };
          }>(
            apiCommissioner,
            `mutation Pick($draftId: Int!, $playerId: Int!) {
                   commissionerPick(draftId: $draftId, playerId: $playerId) {
                     playerId teamId
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

    await test.step('2.7 Poll until draft completes and season is active', async () => {
      await expect
        .poll(
          async () => {
            const r = await graphqlOk<{
              league: { draftStatus: string };
            }>(api, `query { league(id: ${state.leagueId}) { draftStatus } }`);
            return r.league.draftStatus;
          },
          {
            timeout: 120_000,
            intervals: [2_000, 5_000],
            message: 'Draft did not complete',
          },
        )
        .toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — CREATE MATCHUPS
  // -----------------------------------------------------------------------

  test('Phase 3: Create matchups for the season', async ({
    apiCommissioner,
  }) => {
    test.setTimeout(60_000);

    await test.step('3.1 Create all matchups', async () => {
      const data = await graphqlOk<{
        createAllMatchups: {
          matchups: Array<{ id: string; weekNumber: number; status: string }>;
          currentMatchupId: number | null;
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

    await test.step('3.2 Verify initial matchup status: all weeks scheduled', async () => {
      // LS-3751: createAllMatchupsForLeague leaves every week (including
      // week 1) as 'scheduled' so managers can edit lineups during the
      // pre-contest window. The scheduled → in_progress flip now happens
      // in autoSelectGames when the first game is queued (Phase 4).
      const data = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          weekNumber: number;
          status: string;
        }>;
      }>(
        apiCommissioner,
        `query Matchups($leagueId: Int!) {
               getMatchupsForLeague(leagueId: $leagueId) {
                 id weekNumber status
               }
             }`,
        { leagueId: state.leagueId },
      );

      const matchups = data.getMatchupsForLeague;
      expect(matchups.length).toBeGreaterThan(0);

      for (const m of matchups) {
        expect(m.status).toBe('scheduled');
      }
    });

    await test.step('3.3 Verify current week is 1', async () => {
      const data = await graphqlOk<{
        getCurrentWeekForLeague: number | null;
      }>(
        apiCommissioner,
        `query CurrentWeek($leagueId: Int!) {
             getCurrentWeekForLeague(leagueId: $leagueId)
           }`,
        { leagueId: state.leagueId },
      );
      expect(data.getCurrentWeekForLeague).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — WEEK 1: GAME SELECTION + STATS + ADVANCEMENT
  // -----------------------------------------------------------------------

  test('Phase 4: Week 1 — select games, load stats, advance', async ({
    api,
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

    for (let game = 1; game <= GAMES_PER_MATCHUP; game++) {
      await test.step(`4.${game}a Auto-select games (game ${game} of ${GAMES_PER_MATCHUP})`, async () => {
        await graphqlOk<{
          autoSelectGames: { gamesTriggered: number } | null;
        }>(
          apiCommissioner,
          `mutation AutoSelect($leagueId: Int) {
                 autoSelectGames(leagueId: $leagueId) { gamesTriggered }
               }`,
          { leagueId: state.leagueId },
        );
      });

      await test.step(`4.${game}b Wait for stats to load (game ${game})`, async () => {
        const matchups = await waitForAllMatchupsStatsLoaded(
          api,
          state.leagueId,
          1,
          { timeoutMs: 120_000 },
        );
        expect(matchups.length).toBeGreaterThan(0);
      });

      await test.step(`4.${game}c Verify matchup_player_games have valid game_identifier (game ${game})`, async () => {
        // Fetch matchups for week 1. Matchup.id is a GraphQL ID scalar, so it
        // arrives as a string over the wire even though it represents a number.
        const matchupData = await graphqlOk<{
          getMatchupsForLeague: Array<{ id: string }>;
        }>(
          api,
          `query Matchups($leagueId: Int!, $weekNumber: Int) {
                 getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id }
               }`,
          { leagueId: state.leagueId, weekNumber: 1 },
        );

        for (const matchup of matchupData.getMatchupsForLeague) {
          const playerData = await graphqlOk<{
            getMatchupPlayers: Array<{
              id: number;
              playerId: number;
              games: Array<{
                id: number;
                gameIdentifier: string | null;
                gameNum: number | null;
                spSkipped: boolean | null;
              }> | null;
            }>;
          }>(
            api,
            `query MatchupPlayers($matchupId: Int!) {
                   getMatchupPlayers(matchupId: $matchupId) {
                     id playerId
                     games { id gameIdentifier gameNum spSkipped }
                   }
                 }`,
            { matchupId: Number(matchup.id) },
          );

          // At least some players should have games assigned by now
          const playersWithGames = playerData.getMatchupPlayers.filter(
            (mp) => mp.games && mp.games.length > 0,
          );
          expect(playersWithGames.length).toBeGreaterThan(0);

          // gameIdentifier === null iff spSkipped === true (intentional SP-skip slots).
          // Non-skipped games must always have a real identifier.
          for (const mp of playersWithGames) {
            for (const g of mp.games ?? []) {
              if (g.spSkipped) {
                expect(g.gameIdentifier).toBeNull();
              } else {
                expect(g.gameIdentifier).toBeTruthy();
              }
            }
          }

          // At least some games across all players should be real (non-skipped)
          const realGames = playersWithGames.flatMap((mp) =>
            (mp.games ?? []).filter((g) => !g.spSkipped),
          );
          expect(realGames.length).toBeGreaterThan(0);
        }
      });
    }

    await test.step('4.d Verify game counts match gamesPerMatchup', async () => {
      const matchupData = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          selectedGamesCount: number | null;
          gamesPerMatchup: number | null;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
             getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
               id selectedGamesCount gamesPerMatchup
             }
           }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );

      for (const m of matchupData.getMatchupsForLeague) {
        expect(m.selectedGamesCount).toBe(GAMES_PER_MATCHUP);
      }
    });

    await test.step('4.e Verify scores are populated (non-null)', async () => {
      const matchupData = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          team1Score: number | null;
          team2Score: number | null;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
               getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
                 id team1Score team2Score
               }
             }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );

      for (const m of matchupData.getMatchupsForLeague) {
        expect(m.team1Score).not.toBeNull();
        expect(m.team2Score).not.toBeNull();
      }
    });

    await test.step('4.f Verify no duplicate game_identifier per player per matchup', async () => {
      const matchupData = await graphqlOk<{
        getMatchupsForLeague: Array<{ id: string }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
               getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id }
             }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );

      for (const matchup of matchupData.getMatchupsForLeague) {
        const playerData = await graphqlOk<{
          getMatchupPlayers: Array<{
            id: number;
            playerId: number;
            games: Array<{
              gameIdentifier: string | null;
            }> | null;
          }>;
        }>(
          api,
          `query MatchupPlayers($matchupId: Int!) {
                 getMatchupPlayers(matchupId: $matchupId) {
                   id playerId
                   games { gameIdentifier }
                 }
               }`,
          { matchupId: Number(matchup.id) },
        );

        for (const mp of playerData.getMatchupPlayers) {
          const identifiers = (mp.games ?? [])
            .map((g) => g.gameIdentifier)
            .filter(Boolean);
          const uniqueIdentifiers = new Set(identifiers);
          expect(identifiers.length).toBe(uniqueIdentifiers.size);
        }
      }
    });

    await test.step('4.g Auto-advance matchups for week 1', async () => {
      const data = await graphqlOk<{
        autoAdvanceMatchups: { leaguesAdvanced: number } | null;
      }>(
        apiCommissioner,
        `mutation AutoAdvance($leagueId: Int) {
             autoAdvanceMatchups(leagueId: $leagueId) { leaguesAdvanced }
           }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoAdvanceMatchups).toBeTruthy();
    });

    await test.step('4.h Verify week 1 matchups are completed and current week advanced', async () => {
      // Check week 1 matchups are completed
      const week1Data = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          weekNumber: number;
          status: string;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
               getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
                 id weekNumber status
               }
             }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );

      for (const m of week1Data.getMatchupsForLeague) {
        expect(m.status).toBe('completed');
      }

      // Check current week advanced to 2
      const weekData = await graphqlOk<{
        getCurrentWeekForLeague: number | null;
      }>(
        api,
        `query CurrentWeek($leagueId: Int!) {
               getCurrentWeekForLeague(leagueId: $leagueId)
             }`,
        { leagueId: state.leagueId },
      );
      expect(weekData.getCurrentWeekForLeague).toBe(2);

      // Check week 2 matchups are now in_progress
      const week2Data = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          weekNumber: number;
          status: string;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
               getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
                 id weekNumber status
               }
             }`,
        { leagueId: state.leagueId, weekNumber: 2 },
      );

      for (const m of week2Data.getMatchupsForLeague) {
        expect(m.status).toBe('in_progress');
      }
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — WEEK 2: GAME SELECTION + STATS + ADVANCEMENT (FINAL WEEK)
  // -----------------------------------------------------------------------

  test('Phase 5: Week 2 — select games, load stats, advance (final week)', async ({
    api,
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

    for (let game = 1; game <= GAMES_PER_MATCHUP; game++) {
      await test.step(`5.${game}a Auto-select games (game ${game} of ${GAMES_PER_MATCHUP})`, async () => {
        await graphqlOk<{
          autoSelectGames: { gamesTriggered: number } | null;
        }>(
          apiCommissioner,
          `mutation AutoSelect($leagueId: Int) {
                 autoSelectGames(leagueId: $leagueId) { gamesTriggered }
               }`,
          { leagueId: state.leagueId },
        );
      });

      await test.step(`5.${game}b Wait for stats to load (game ${game})`, async () => {
        const matchups = await waitForAllMatchupsStatsLoaded(
          api,
          state.leagueId,
          2,
          { timeoutMs: 120_000 },
        );
        expect(matchups.length).toBeGreaterThan(0);
      });
    }

    await test.step('5.c Verify scores populated for week 2', async () => {
      const matchupData = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          team1Score: number | null;
          team2Score: number | null;
          selectedGamesCount: number | null;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
             getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
               id team1Score team2Score selectedGamesCount
             }
           }`,
        { leagueId: state.leagueId, weekNumber: 2 },
      );

      for (const m of matchupData.getMatchupsForLeague) {
        expect(m.team1Score).not.toBeNull();
        expect(m.team2Score).not.toBeNull();
        expect(m.selectedGamesCount).toBe(GAMES_PER_MATCHUP);
      }
    });

    await test.step('5.d Verify no duplicate game_identifier per player in week 2', async () => {
      const matchupData = await graphqlOk<{
        getMatchupsForLeague: Array<{ id: string }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int) {
               getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id }
             }`,
        { leagueId: state.leagueId, weekNumber: 2 },
      );

      for (const matchup of matchupData.getMatchupsForLeague) {
        const playerData = await graphqlOk<{
          getMatchupPlayers: Array<{
            id: number;
            playerId: number;
            games: Array<{
              gameIdentifier: string | null;
            }> | null;
          }>;
        }>(
          api,
          `query MatchupPlayers($matchupId: Int!) {
                 getMatchupPlayers(matchupId: $matchupId) {
                   id playerId
                   games { gameIdentifier }
                 }
               }`,
          { matchupId: Number(matchup.id) },
        );

        for (const mp of playerData.getMatchupPlayers) {
          const identifiers = (mp.games ?? [])
            .map((g) => g.gameIdentifier)
            .filter(Boolean);
          const uniqueIdentifiers = new Set(identifiers);
          expect(identifiers.length).toBe(uniqueIdentifiers.size);
        }
      }
    });

    await test.step('5.e Auto-advance matchups for week 2 (final)', async () => {
      const data = await graphqlOk<{
        autoAdvanceMatchups: { leaguesAdvanced: number } | null;
      }>(
        apiCommissioner,
        `mutation AutoAdvance($leagueId: Int) {
               autoAdvanceMatchups(leagueId: $leagueId) { leaguesAdvanced }
             }`,
        { leagueId: state.leagueId },
      );
      expect(data.autoAdvanceMatchups).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — SEASON END VERIFICATION
  // -----------------------------------------------------------------------

  test('Phase 6: Verify season completed', async ({ api }) => {
    test.setTimeout(60_000);

    await test.step('6.1 All matchups across all weeks are completed', async () => {
      const data = await graphqlOk<{
        getMatchupsForLeague: Array<{
          id: string;
          weekNumber: number;
          status: string;
        }>;
      }>(
        api,
        `query AllMatchups($leagueId: Int!) {
               getMatchupsForLeague(leagueId: $leagueId) {
                 id weekNumber status
               }
             }`,
        { leagueId: state.leagueId },
      );

      const matchups = data.getMatchupsForLeague;
      expect(matchups.length).toBeGreaterThan(0);

      for (const m of matchups) {
        expect(m.status).toBe('completed');
      }

      // Verify we had matchups for each expected week
      const weeks = new Set(matchups.map((m) => m.weekNumber));
      for (let w = 1; w <= TOTAL_MATCHUPS; w++) {
        expect(weeks.has(w)).toBe(true);
      }
    });

    await test.step('6.2 League reflects season end (no active current matchup)', async () => {
      const data = await graphqlOk<{
        league: {
          draftStatus: string;
          currentMatchup: number | null;
          totalMatchups: number | null;
        };
      }>(
        api,
        `query LeagueState($id: Int!) {
               league(id: $id) {
                 draftStatus currentMatchup totalMatchups
               }
             }`,
        { id: state.leagueId },
      );
      expect(data.league.draftStatus).toBe('completed');
      expect(data.league.currentMatchup).toBeNull();
    });

    await test.step('6.3 League standings reflect completed season', async () => {
      const data = await graphqlOk<{
        getLeagueStandings: Array<{
          teamId: number;
          wins: number;
          losses: number;
        }>;
      }>(
        api,
        `query Standings($leagueId: Int!) {
               getLeagueStandings(leagueId: $leagueId) {
                 teamId wins losses pointsFor pointsAgainst rank
               }
             }`,
        { leagueId: state.leagueId },
      );

      expect(data.getLeagueStandings.length).toBeGreaterThan(0);

      // Total wins + losses across all teams should equal
      // 2 * number of matchups (each matchup produces 1 win + 1 loss)
      const totalWins = data.getLeagueStandings.reduce(
        (sum, t) => sum + t.wins,
        0,
      );
      const totalLosses = data.getLeagueStandings.reduce(
        (sum, t) => sum + t.losses,
        0,
      );
      expect(totalWins).toBe(totalLosses);
    });
  });
});
