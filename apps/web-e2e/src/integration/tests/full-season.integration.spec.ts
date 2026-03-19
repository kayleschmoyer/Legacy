import { expect, test } from '../fixtures/api';
import { graphqlOk } from '../helpers/graphql';

/**
 * Full-season integration test: exercises every team-manager action from
 * league creation through season-end renewal. Uses `test.describe.serial()`
 * so each phase is a discrete test — if one fails, the rest are skipped.
 *
 * Prerequisites:
 *   - Local GraphQL server running (`pnpm exec nx serve db`)
 *   - Docker Postgres with seeded player data
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts
 */

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------
interface SeasonState {
  leagueId: number;
  inviteCode: string;
  /** teams[0] = api's team, teams[1] = api2's team */
  teams: Array<{ id: number; name: string }>;
  draftId: number;
  /**
   * Ordered team IDs from the randomized draft order.  Used to determine
   * the number of teams per round (all picks use `commissionerPick`).
   */
  draftTeamOrder: number[];
  /** Player IDs on team-1's roster (built during draft). */
  team1Roster: number[];
  /** Player IDs on team-2's roster. */
  team2Roster: number[];
  /** Available players fetched during draft setup. */
  availablePlayers: Array<{ id: number; firstName: string }>;
  /** IDs of matchup-player entries for lineup management. */
  matchupPlayerIds: number[];
  matchupId: number;
  tradeOfferId: number;
  waiverClaimId: number;
}

// ---------------------------------------------------------------------------
// GraphQL fragments — kept close to the test for easy reading.
// ---------------------------------------------------------------------------
const LEAGUE_FIELDS = `
  id name draftStatus currentWeek inviteCode seasonNumber previousLeagueId
`;

const TEAM_FIELDS = `id name`;

// ---------------------------------------------------------------------------
// Module-level state shared across serial tests in a single worker.
// ---------------------------------------------------------------------------
let state: SeasonState;

// ---------------------------------------------------------------------------
// The serial test suite
// ---------------------------------------------------------------------------

test.describe.serial('Full Season Lifecycle @integration @critical', () => {
  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      teams: [],
      draftId: 0,
      draftTeamOrder: [],
      team1Roster: [],
      team2Roster: [],
      availablePlayers: [],
      matchupPlayerIds: [],
      matchupId: 0,
      tradeOfferId: 0,
      waiverClaimId: 0,
    };
  });

  // -------------------------------------------------------------------------
  // PHASE 1 — PRE-SEASON: LEAGUE SETUP
  // -------------------------------------------------------------------------

  test('Phase 1: League setup', async ({ api, api2, apiCommissioner }) => {
    // Reset teams array so retries (global retries: 1) start fresh
    state.teams = [];
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
             league { ${LEAGUE_FIELDS} }
             teams { id name }
           }
         }`,
        {
          input: {
            leagueName: 'Integration Season Test League',
            numberOfTeams: 3,
            playerPool: 'all',
          },
        },
      );
      state.leagueId = Number(data.createLeagueAndTeams.league.id);
      state.inviteCode = data.createLeagueAndTeams.league.inviteCode;
      expect(state.leagueId).toBeGreaterThan(0);
      expect(state.inviteCode).toBeTruthy();
    });

    await test.step('1.2 Team manager 1 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
           joinLeague(inviteCode: $inviteCode, teamName: $teamName) {
             teamId
           }
         }`,
        { inviteCode: state.inviteCode, teamName: 'The Sluggers' },
      );
      expect(data.joinLeague.teamId).toBeGreaterThan(0);
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'The Sluggers',
      });
    });

    await test.step('1.3 Team manager 2 joins league', async () => {
      const data = await graphqlOk<{
        joinLeague: { teamId: number };
      }>(
        api2,
        `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
           joinLeague(inviteCode: $inviteCode, teamName: $teamName) {
             teamId
           }
         }`,
        { inviteCode: state.inviteCode, teamName: 'The Aces' },
      );
      expect(data.joinLeague.teamId).toBeGreaterThan(0);
      state.teams.push({
        id: Number(data.joinLeague.teamId),
        name: 'The Aces',
      });
    });

    await test.step('1.4 Rename team', async () => {
      const team = state.teams[0];
      const data = await graphqlOk<{
        renameTeam: { id: number; name: string };
      }>(
        api,
        `mutation RenameTeam($leagueId: Int!, $teamId: Int!, $newName: String!) {
           renameTeam(leagueId: $leagueId, teamId: $teamId, newName: $newName) {
             ${TEAM_FIELDS}
           }
         }`,
        {
          leagueId: state.leagueId,
          teamId: team.id,
          newName: 'The Mighty Sluggers',
        },
      );
      expect(data.renameTeam.name).toBe('The Mighty Sluggers');
      state.teams[0].name = data.renameTeam.name;
    });

    await test.step('1.5 Update team branding', async () => {
      const team = state.teams[0];
      const data = await graphqlOk<{
        updateTeamBranding: { id: number; primaryColor: string };
      }>(
        api,
        `mutation UpdateBranding(
           $leagueId: Int!, $teamId: Int!,
           $primaryColor: String, $secondaryColor: String
         ) {
           updateTeamBranding(
             leagueId: $leagueId, teamId: $teamId,
             primaryColor: $primaryColor, secondaryColor: $secondaryColor
           ) { id primaryColor secondaryColor }
         }`,
        {
          leagueId: state.leagueId,
          teamId: team.id,
          primaryColor: '#1E3A5F',
          secondaryColor: '#FFD700',
        },
      );
      expect(data.updateTeamBranding.primaryColor).toBe('#1E3A5F');
    });

    await test.step('1.6 Verify league pre-draft state', async () => {
      const data = await graphqlOk<{
        league: { draftStatus: string; seasonNumber: number };
      }>(
        api,
        `query GetLeague($id: Int!) {
           league(id: $id) { ${LEAGUE_FIELDS} }
         }`,
        { id: state.leagueId },
      );
      expect(data.league.draftStatus).toBe('not-started');
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 2 — DRAFT
  // -------------------------------------------------------------------------

  test('Phase 2: Draft', async ({ api, api2, apiCommissioner }) => {
    await test.step('2.1 Commissioner initializes draft', async () => {
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

      // Store the draft order so subsequent steps pick with the correct
      // API context.
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

    await test.step('2.3 Fetch available draft players', async () => {
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

    await test.step('2.4 Add players to draft queue', async () => {
      for (const player of state.availablePlayers.slice(0, 5)) {
        const data = await graphqlOk<{
          addToDraftQueue: Array<{ playerId: number }>;
        }>(
          api,
          `mutation AddToQueue($draftId: Int!, $playerId: Int!) {
             addToDraftQueue(draftId: $draftId, playerId: $playerId) {
               playerId priority
             }
           }`,
          { draftId: state.draftId, playerId: player.id },
        );
        expect(data.addToDraftQueue.length).toBeGreaterThan(0);
      }
    });

    await test.step('2.5 Reorder draft queue', async () => {
      const queuePlayerIds = state.availablePlayers
        .slice(0, 5)
        .map((p) => p.id)
        .reverse();
      const data = await graphqlOk<{
        reorderDraftQueue: Array<{ playerId: number; priority: number }>;
      }>(
        api,
        `mutation ReorderQueue($draftId: Int!, $playerIds: [Int!]!) {
           reorderDraftQueue(draftId: $draftId, playerIds: $playerIds) {
             playerId priority
           }
         }`,
        { draftId: state.draftId, playerIds: queuePlayerIds },
      );
      expect(data.reorderDraftQueue[0].playerId).toBe(queuePlayerIds[0]);
    });

    await test.step('2.6 Enable auto-pick', async () => {
      const data = await graphqlOk<{ toggleDraftAutoPick: boolean }>(
        api,
        `mutation AutoPick($draftId: Int!, $enable: Boolean!) {
           toggleDraftAutoPick(draftId: $draftId, enable: $enable)
         }`,
        { draftId: state.draftId, enable: true },
      );
      expect(data.toggleDraftAutoPick).toBe(true);
    });

    await test.step('2.7 Disable auto-pick (back to manual)', async () => {
      await graphqlOk(
        api,
        `mutation AutoPick($draftId: Int!, $enable: Boolean!) {
           toggleDraftAutoPick(draftId: $draftId, enable: $enable)
         }`,
        { draftId: state.draftId, enable: false },
      );
    });

    await test.step('2.8 Commissioner starts draft', async () => {
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

    await test.step('2.9 Poll until draft is in-progress', async () => {
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

    await test.step('2.10 Make draft picks (round 1)', async () => {
      // Use commissionerPick for all picks — the commissioner can pick on
      // behalf of any team regardless of turn order, avoiding flaky
      // draft-order mismatches.
      const numTeams = state.draftTeamOrder.length;
      for (let i = 0; i < numTeams; i++) {
        const player = state.availablePlayers[5 + i];
        const data = await graphqlOk<{
          commissionerPick: { id: number; playerId: number; teamId: number };
        }>(
          apiCommissioner,
          `mutation Pick($draftId: Int!, $playerId: Int!) {
             commissionerPick(draftId: $draftId, playerId: $playerId) {
               id playerId teamId round overallPick
             }
           }`,
          { draftId: state.draftId, playerId: player.id },
        );
        // Track which roster the player landed on
        if (data.commissionerPick.teamId === state.teams[0].id) {
          state.team1Roster.push(Number(data.commissionerPick.playerId));
        } else if (data.commissionerPick.teamId === state.teams[1].id) {
          state.team2Roster.push(Number(data.commissionerPick.playerId));
        }
      }
    });

    await test.step('2.11 Undo last pick and re-pick', async () => {
      const undoData = await graphqlOk<{
        undoLastDraftPick: { id: number; playerId: number };
      }>(
        apiCommissioner,
        `mutation Undo($draftId: Int!) {
           undoLastDraftPick(draftId: $draftId) { id playerId }
         }`,
        { draftId: state.draftId },
      );
      // Remove the undone player from whichever roster it was on
      for (const roster of [state.team1Roster, state.team2Roster]) {
        const idx = roster.indexOf(undoData.undoLastDraftPick.playerId);
        if (idx >= 0) {
          roster.splice(idx, 1);
          break;
        }
      }

      const rePick = state.availablePlayers[5 + state.draftTeamOrder.length];
      const reData = await graphqlOk<{
        commissionerPick: { playerId: number; teamId: number };
      }>(
        apiCommissioner,
        `mutation Pick($draftId: Int!, $playerId: Int!) {
           commissionerPick(draftId: $draftId, playerId: $playerId) {
             id playerId teamId
           }
         }`,
        { draftId: state.draftId, playerId: rePick.id },
      );
      if (reData.commissionerPick.teamId === state.teams[0].id) {
        state.team1Roster.push(Number(reData.commissionerPick.playerId));
      } else if (reData.commissionerPick.teamId === state.teams[1].id) {
        state.team2Roster.push(Number(reData.commissionerPick.playerId));
      }
    });

    await test.step('2.12 Continue draft — additional rounds', async () => {
      const numTeams = state.draftTeamOrder.length;
      let playerIdx = 5 + numTeams + 1; // after round 1 + re-pick
      const additionalRounds = 3;

      for (let round = 0; round < additionalRounds; round++) {
        for (let t = 0; t < numTeams; t++) {
          if (!state.availablePlayers[playerIdx]) break;

          const d = await graphqlOk<{
            commissionerPick: { playerId: number; teamId: number };
          }>(
            apiCommissioner,
            `mutation Pick($draftId: Int!, $playerId: Int!) {
               commissionerPick(draftId: $draftId, playerId: $playerId) { playerId teamId }
             }`,
            {
              draftId: state.draftId,
              playerId: state.availablePlayers[playerIdx].id,
            },
          );
          if (d.commissionerPick.teamId === state.teams[0].id) {
            state.team1Roster.push(Number(d.commissionerPick.playerId));
          } else if (d.commissionerPick.teamId === state.teams[1].id) {
            state.team2Roster.push(Number(d.commissionerPick.playerId));
          }
          playerIdx++;
        }
      }

      expect(state.team1Roster.length).toBeGreaterThanOrEqual(4);
      expect(state.team2Roster.length).toBeGreaterThanOrEqual(4);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 3 — POST-DRAFT ROSTER SETUP
  // -------------------------------------------------------------------------

  test('Phase 3: Post-draft roster setup', async ({ api }) => {
    // Helper: fetch team members for api's team (teams[0]).
    const fetchMyTeamMembers = async <T extends string>(fields: T) => {
      const data = await graphqlOk<{
        teamMembers: Array<Record<string, unknown>>;
      }>(
        api,
        `query Members($teamId: Int!) {
           teamMembers(teamId: $teamId) { ${fields} }
         }`,
        { teamId: state.teams[0].id },
      );
      return data.teamMembers;
    };

    await test.step('3.1 Set player positions on roster', async () => {
      // Fetch actual league position IDs (they're auto-generated, not 1,2,3).
      const posData = await graphqlOk<{
        leaguePositions: Array<{ id: number; positionType: string }>;
      }>(
        api,
        `query Positions($leagueId: Int!) {
           leaguePositions(leagueId: $leagueId) { id positionType }
         }`,
        { leagueId: state.leagueId },
      );
      expect(posData.leaguePositions.length).toBeGreaterThan(0);
      const firstPositionId = posData.leaguePositions[0].id;

      const members = await fetchMyTeamMembers('id playerId positionId');
      expect(members.length).toBeGreaterThan(0);

      const member = members[0] as {
        id: number;
        playerId: number;
        positionId: number | null;
      };
      const setData = await graphqlOk<{
        updateTeamMemberPosition: { id: number; positionId: number };
      }>(
        api,
        `mutation SetPos($teamMemberId: Int!, $positionId: Int) {
           updateTeamMemberPosition(teamMemberId: $teamMemberId, positionId: $positionId) {
             id positionId
           }
         }`,
        { teamMemberId: member.id, positionId: firstPositionId },
      );
      expect(setData.updateTeamMemberPosition.positionId).toBe(firstPositionId);
    });

    await test.step('3.2 Swap player positions', async () => {
      // Get actual league position IDs for the swap fallback
      const posData = await graphqlOk<{
        leaguePositions: Array<{ id: number }>;
      }>(
        api,
        `query Positions($leagueId: Int!) {
           leaguePositions(leagueId: $leagueId) { id }
         }`,
        { leagueId: state.leagueId },
      );
      const posIds = posData.leaguePositions.map((p) => p.id);

      const members = (await fetchMyTeamMembers('id positionId')) as Array<{
        id: number;
        positionId: number | null;
      }>;
      if (members.length >= 2 && posIds.length >= 2) {
        const [a, b] = members;
        const swapData = await graphqlOk<{
          swapTeamMemberPositions: Array<{ id: number; positionId: number }>;
        }>(
          api,
          `mutation Swap(
             $teamMemberIdA: Int!, $teamMemberIdB: Int!,
             $positionIdA: Int, $positionIdB: Int
           ) {
             swapTeamMemberPositions(
               teamMemberIdA: $teamMemberIdA, teamMemberIdB: $teamMemberIdB,
               positionIdA: $positionIdA, positionIdB: $positionIdB
             ) { id positionId }
           }`,
          {
            teamMemberIdA: a.id,
            teamMemberIdB: b.id,
            positionIdA: b.positionId ?? posIds[1],
            positionIdB: a.positionId ?? posIds[0],
          },
        );
        expect(swapData.swapTeamMemberPositions).toHaveLength(2);
      }
    });

    await test.step('3.3 Mark player for trade block', async () => {
      const members = (await fetchMyTeamMembers('id')) as Array<{
        id: number;
      }>;
      if (members.length > 0) {
        const tbData = await graphqlOk<{
          setTradeBlock: { id: number; onTradeBlock: boolean };
        }>(
          api,
          `mutation TradeBlock($teamMemberId: Int!, $onTradeBlock: Boolean!) {
             setTradeBlock(teamMemberId: $teamMemberId, onTradeBlock: $onTradeBlock) {
               id onTradeBlock
             }
           }`,
          { teamMemberId: members[0].id, onTradeBlock: true },
        );
        expect(tbData.setTradeBlock.onTradeBlock).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 4 — REGULAR SEASON: MATCHUPS & LINEUPS
  // -------------------------------------------------------------------------

  test('Phase 4: Matchups & lineups', async ({ api, apiCommissioner }) => {
    await test.step('4.1 Commissioner creates all matchups', async () => {
      const data = await graphqlOk<{
        createAllMatchups: {
          matchups: Array<{ id: number }>;
          currentMatchupId: number | null;
        };
      }>(
        apiCommissioner,
        `mutation CreateMatchups($leagueId: Int!) {
           createAllMatchups(leagueId: $leagueId) {
             matchups { id }
             currentMatchupId
           }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.createAllMatchups.matchups.length).toBeGreaterThan(0);
    });

    await test.step('4.2 Query week 1 matchups', async () => {
      const data = await graphqlOk<{
        getMatchupsByWeek: Array<{
          id: number;
          weekNumber: number;
          team1Id: number;
          team2Id: number;
          status: string;
        }>;
      }>(
        api,
        `query Matchups($leagueId: Int!, $weekNumber: Int!) {
           getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
             id weekNumber team1Id team2Id status
           }
         }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );
      expect(data.getMatchupsByWeek.length).toBeGreaterThan(0);
      state.matchupId = Number(data.getMatchupsByWeek[0].id);
    });

    await test.step('4.3 Query matchup players for lineup', async () => {
      const data = await graphqlOk<{
        getMatchupPlayers: Array<{
          id: number;
          playerId: number;
          teamId: number;
          positionId: number | null;
        }>;
      }>(
        api,
        `query MatchupPlayers($matchupId: Int!) {
           getMatchupPlayers(matchupId: $matchupId) {
             id playerId teamId positionId
           }
         }`,
        { matchupId: state.matchupId },
      );
      state.matchupPlayerIds = data.getMatchupPlayers
        .filter((mp) => mp.teamId === state.teams[0].id)
        .map((mp) => mp.id);
    });

    await test.step('4.4 Set weekly lineup position', async () => {
      if (state.matchupPlayerIds.length > 0) {
        const mp = state.matchupPlayerIds[0];
        const data = await graphqlOk<{
          updateMatchupPlayerPosition: { id: number; positionId: number };
        }>(
          api,
          `mutation SetLineup($matchupPlayerId: Int!, $positionId: Int) {
             updateMatchupPlayerPosition(
               matchupPlayerId: $matchupPlayerId, positionId: $positionId
             ) { id positionId }
           }`,
          { matchupPlayerId: mp, positionId: 1 },
        );
        expect(data.updateMatchupPlayerPosition.positionId).toBe(1);
      }
    });

    await test.step('4.5 Swap lineup positions', async () => {
      if (state.matchupPlayerIds.length >= 2) {
        const [a, b] = state.matchupPlayerIds;
        const data = await graphqlOk<{
          swapMatchupPlayerPositions: Array<{ id: number }>;
        }>(
          api,
          `mutation SwapLineup(
             $matchupPlayerIdA: Int!, $matchupPlayerIdB: Int!,
             $positionIdA: Int, $positionIdB: Int
           ) {
             swapMatchupPlayerPositions(
               matchupPlayerIdA: $matchupPlayerIdA,
               matchupPlayerIdB: $matchupPlayerIdB,
               positionIdA: $positionIdA, positionIdB: $positionIdB
             ) { id positionId }
           }`,
          {
            matchupPlayerIdA: a,
            matchupPlayerIdB: b,
            positionIdA: 2,
            positionIdB: 1,
          },
        );
        expect(data.swapMatchupPlayerPositions).toHaveLength(2);
      }
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 5 — ROSTER MOVES: FREE AGENCY & WAIVERS
  // -------------------------------------------------------------------------

  test('Phase 5: Free agency & waivers', async ({ api, apiCommissioner }) => {
    await test.step('5.1 Claim free agent', async () => {
      const faPlayer =
        state.availablePlayers[state.availablePlayers.length - 1];
      const dropPlayer = state.team1Roster[state.team1Roster.length - 1];

      const data = await graphqlOk<{
        claimFreeAgent: { id: number; status: string };
      }>(
        api,
        `mutation Claim($leagueId: Int!, $playerId: Int!, $dropPlayerId: Int) {
           claimFreeAgent(
             leagueId: $leagueId, playerId: $playerId, dropPlayerId: $dropPlayerId
           ) { id status }
         }`,
        {
          leagueId: state.leagueId,
          playerId: faPlayer.id,
          dropPlayerId: dropPlayer,
        },
      );
      state.waiverClaimId = Number(data.claimFreeAgent.id);
      expect(state.waiverClaimId).toBeGreaterThan(0);
    });

    await test.step('5.2 Cancel waiver claim', async () => {
      const data = await graphqlOk<{
        cancelWaiverClaim: { id: number; status: string };
      }>(
        api,
        `mutation Cancel($claimId: Int!) {
           cancelWaiverClaim(claimId: $claimId) { id status }
         }`,
        { claimId: state.waiverClaimId },
      );
      expect(data.cancelWaiverClaim.id).toBe(state.waiverClaimId);
    });

    await test.step('5.3 Re-claim a different free agent', async () => {
      const faPlayer =
        state.availablePlayers[state.availablePlayers.length - 2];
      const dropPlayer = state.team1Roster[state.team1Roster.length - 1];

      const data = await graphqlOk<{
        claimFreeAgent: { id: number };
      }>(
        api,
        `mutation Claim($leagueId: Int!, $playerId: Int!, $dropPlayerId: Int) {
           claimFreeAgent(
             leagueId: $leagueId, playerId: $playerId, dropPlayerId: $dropPlayerId
           ) { id status }
         }`,
        {
          leagueId: state.leagueId,
          playerId: faPlayer.id,
          dropPlayerId: dropPlayer,
        },
      );
      state.waiverClaimId = Number(data.claimFreeAgent.id);
    });

    await test.step('5.4 Process waivers', async () => {
      const data = await graphqlOk<{
        processWaiverClaims: { processedCount: number };
      }>(
        apiCommissioner,
        `mutation ProcessWaivers($leagueId: Int) {
           processWaiverClaims(leagueId: $leagueId) { processedCount }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.processWaiverClaims.processedCount).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 6 — TRADING
  // -------------------------------------------------------------------------

  test('Phase 6: Trading', async ({ api, api2 }) => {
    await test.step('6.1 Propose trade', async () => {
      const offeringPlayerId = state.team1Roster[1];
      const requestingPlayerId = state.team2Roster[1];

      const data = await graphqlOk<{
        proposeTrade: { id: number; status: string };
      }>(
        api,
        `mutation Trade(
           $leagueId: Int!, $receivingTeamId: Int!,
           $offeringPlayerIds: [Int!]!, $requestingPlayerIds: [Int!]!,
           $message: String
         ) {
           proposeTrade(
             leagueId: $leagueId, receivingTeamId: $receivingTeamId,
             offeringPlayerIds: $offeringPlayerIds,
             requestingPlayerIds: $requestingPlayerIds,
             message: $message
           ) { id status }
         }`,
        {
          leagueId: state.leagueId,
          receivingTeamId: state.teams[1].id,
          offeringPlayerIds: [offeringPlayerId],
          requestingPlayerIds: [requestingPlayerId],
          message: 'Fair trade?',
        },
      );
      state.tradeOfferId = Number(data.proposeTrade.id);
      expect(data.proposeTrade.status).toBe('pending');
    });

    await test.step('6.2 Query pending trades', async () => {
      const data = await graphqlOk<{
        leagueTradeOffers: Array<{ id: number; status: string }>;
      }>(
        api,
        `query Trades($leagueId: Int!) {
           leagueTradeOffers(leagueId: $leagueId) { id status }
         }`,
        { leagueId: state.leagueId },
      );
      const pending = data.leagueTradeOffers.filter(
        (t) => t.status === 'pending',
      );
      expect(pending.length).toBeGreaterThan(0);
    });

    await test.step('6.3 Reject trade', async () => {
      const data = await graphqlOk<{
        rejectTrade: { id: number; status: string };
      }>(
        api2,
        `mutation Reject($tradeId: Int!) {
           rejectTrade(tradeId: $tradeId) { id status }
         }`,
        { tradeId: state.tradeOfferId },
      );
      expect(data.rejectTrade.status).toBe('rejected');
    });

    await test.step('6.4 Propose and accept a second trade', async () => {
      const offeringPlayerId = state.team1Roster[2];
      const requestingPlayerId = state.team2Roster[2];

      const proposeData = await graphqlOk<{
        proposeTrade: { id: number };
      }>(
        api,
        `mutation Trade(
           $leagueId: Int!, $receivingTeamId: Int!,
           $offeringPlayerIds: [Int!]!, $requestingPlayerIds: [Int!]!
         ) {
           proposeTrade(
             leagueId: $leagueId, receivingTeamId: $receivingTeamId,
             offeringPlayerIds: $offeringPlayerIds,
             requestingPlayerIds: $requestingPlayerIds
           ) { id status }
         }`,
        {
          leagueId: state.leagueId,
          receivingTeamId: state.teams[1].id,
          offeringPlayerIds: [offeringPlayerId],
          requestingPlayerIds: [requestingPlayerId],
        },
      );

      const acceptData = await graphqlOk<{
        acceptTrade: { id: number; status: string };
      }>(
        api2,
        `mutation Accept($tradeId: Int!) {
           acceptTrade(tradeId: $tradeId) { id status }
         }`,
        { tradeId: proposeData.proposeTrade.id },
      );
      expect(acceptData.acceptTrade.status).toBe('accepted');
    });

    await test.step('6.5 Propose and cancel a trade', async () => {
      const proposeData = await graphqlOk<{
        proposeTrade: { id: number };
      }>(
        api,
        `mutation Trade(
           $leagueId: Int!, $receivingTeamId: Int!,
           $offeringPlayerIds: [Int!]!, $requestingPlayerIds: [Int!]!
         ) {
           proposeTrade(
             leagueId: $leagueId, receivingTeamId: $receivingTeamId,
             offeringPlayerIds: $offeringPlayerIds,
             requestingPlayerIds: $requestingPlayerIds
           ) { id status }
         }`,
        {
          leagueId: state.leagueId,
          receivingTeamId: state.teams[1].id,
          offeringPlayerIds: [state.team1Roster[0]],
          requestingPlayerIds: [state.team2Roster[0]],
        },
      );

      const cancelData = await graphqlOk<{
        cancelTrade: { id: number; status: string };
      }>(
        api,
        `mutation Cancel($tradeId: Int!) {
           cancelTrade(tradeId: $tradeId) { id status }
         }`,
        { tradeId: proposeData.proposeTrade.id },
      );
      expect(cancelData.cancelTrade.status).toBe('cancelled');
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 7 — WEEK ADVANCEMENT
  // -------------------------------------------------------------------------

  test('Phase 7: Week advancement', async ({ apiCommissioner }) => {
    await test.step('7.1 Auto-select games for league', async () => {
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

    await test.step('7.2 Auto-advance matchups (commissioner)', async () => {
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

  // -------------------------------------------------------------------------
  // PHASE 8 — STANDINGS & ACTIVITY
  // -------------------------------------------------------------------------

  test('Phase 8: Standings & activity', async ({ api }) => {
    await test.step('8.1 Get league standings', async () => {
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
    });

    await test.step('8.2 Get league activity feed', async () => {
      const data = await graphqlOk<{
        leagueActivity: Array<{ eventType: string }>;
      }>(
        api,
        `query Activity($leagueId: Int!) {
           leagueActivity(leagueId: $leagueId) { eventType description createdAt }
         }`,
        { leagueId: state.leagueId },
      );
      expect(data.leagueActivity.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 9 — COMMUNICATION
  // -------------------------------------------------------------------------

  test('Phase 9: Communication', async ({ api, apiCommissioner }) => {
    await test.step('9.1 Send league message', async () => {
      const data = await graphqlOk<{
        sendLeagueMessage: { id: number; messageText: string };
      }>(
        api,
        `mutation Msg($leagueId: Int!, $messageText: String!) {
           sendLeagueMessage(leagueId: $leagueId, messageText: $messageText) {
             id messageText
           }
         }`,
        {
          leagueId: state.leagueId,
          messageText: 'Great draft everyone!',
        },
      );
      expect(data.sendLeagueMessage.messageText).toBe('Great draft everyone!');
    });

    await test.step('9.2 Send matchup trash talk', async () => {
      const data = await graphqlOk<{
        sendMatchupMessage: { id: number; message: string };
      }>(
        api,
        `mutation MMsg($matchupId: Int!, $message: String!) {
           sendMatchupMessage(matchupId: $matchupId, message: $message) {
             id message
           }
         }`,
        {
          matchupId: state.matchupId,
          message: 'You are going down this week!',
        },
      );
      expect(data.sendMatchupMessage.message).toBe(
        'You are going down this week!',
      );
    });

    await test.step('9.3 Send direct message', async () => {
      const data = await graphqlOk<{
        sendDirectMessage: { id: number; messageText: string };
      }>(
        api,
        `mutation DM($toUserId: Int!, $messageText: String!, $leagueId: Int) {
           sendDirectMessage(
             toUserId: $toUserId, messageText: $messageText, leagueId: $leagueId
           ) { id messageText }
         }`,
        {
          toUserId: 2,
          messageText: 'Want to make a deal?',
          leagueId: state.leagueId,
        },
      );
      expect(data.sendDirectMessage.messageText).toBe('Want to make a deal?');
    });

    await test.step('9.4 Commissioner posts league announcement', async () => {
      const data = await graphqlOk<{
        postLeagueAnnouncement: { id: number; messageText: string };
      }>(
        apiCommissioner,
        `mutation Announce($leagueId: Int!, $messageText: String!) {
           postLeagueAnnouncement(leagueId: $leagueId, messageText: $messageText) {
             id messageText
           }
         }`,
        {
          leagueId: state.leagueId,
          messageText: 'Trade deadline is next week!',
        },
      );
      expect(data.postLeagueAnnouncement.messageText).toBe(
        'Trade deadline is next week!',
      );
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 10 — SEASON END & RENEWAL
  // -------------------------------------------------------------------------

  test('Phase 10: Season end & renewal', async ({ apiCommissioner }) => {
    await test.step('10.1 Award champion badge', async () => {
      const data = await graphqlOk<{
        awardLeagueChampionBadge: boolean;
      }>(
        apiCommissioner,
        `mutation Champion($leagueId: Int!, $teamId: Int!, $userId: Int!) {
           awardLeagueChampionBadge(
             leagueId: $leagueId, teamId: $teamId, userId: $userId
           )
         }`,
        {
          leagueId: state.leagueId,
          teamId: state.teams[0].id,
          userId: 1,
        },
      );
      expect(data.awardLeagueChampionBadge).toBe(true);
    });

    await test.step('10.2 Award playoff appearance badges', async () => {
      const data = await graphqlOk<{
        awardPlayoffAppearanceBadges: boolean;
      }>(
        apiCommissioner,
        `mutation PlayoffBadges($leagueId: Int!, $teamIds: [Int!]!) {
           awardPlayoffAppearanceBadges(leagueId: $leagueId, teamIds: $teamIds)
         }`,
        {
          leagueId: state.leagueId,
          teamIds: state.teams.map((t) => t.id),
        },
      );
      expect(data.awardPlayoffAppearanceBadges).toBe(true);
    });

    await test.step('10.3 Renew league for next season', async () => {
      const data = await graphqlOk<{
        renewLeague: {
          id: number;
          seasonNumber: number;
          previousLeagueId: number;
          draftStatus: string;
        };
      }>(
        apiCommissioner,
        `mutation Renew($leagueId: Int!, $keepRosters: Boolean!) {
           renewLeague(leagueId: $leagueId, keepRosters: $keepRosters) {
             id seasonNumber previousLeagueId draftStatus
           }
         }`,
        { leagueId: state.leagueId, keepRosters: false },
      );
      expect(data.renewLeague.seasonNumber).toBeGreaterThan(1);
      expect(data.renewLeague.previousLeagueId).toBe(state.leagueId);
      expect(data.renewLeague.draftStatus).toBe('not-started');
    });
  });
});
