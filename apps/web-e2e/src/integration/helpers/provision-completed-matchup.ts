import { LOGGER } from '@legacy-sports/logging';
import { gqlFetch } from './gql-fetch';
import { waitForWeekStatsHydrated } from './wait-for-stats-hydrated';

/**
 * API-driven provisioning of a single completed matchup with a narrative recap
 * (LS-7704).
 *
 * The matchup-roster-recap spec used to *discover* a completed-with-recap
 * matchup among the test commissioner's pre-existing leagues. That made the
 * spec depend on seed data that the global sweep wipes for the base
 * commissioner, so it found zero leagues and failed in `beforeAll`. Instead we
 * provision our own data: create a 2-team league, run a one-week season to
 * completion, and return the resulting completed matchup. Matchup recaps are
 * generated synchronously and deterministically when a matchup is `completed`
 * (lambdas/db/.../matchups/types.ts → @legacy-sports/narrative — no LLM, no
 * queue), so a completed matchup always has a recap.
 *
 * All calls are JWT-based `gqlFetch` so the helper works from the UI fixture
 * (which exposes `commissionerJwt` / `managerJwt*` rather than an
 * `APIRequestContext`).
 */

/** Roster size — large enough that drafted players spill onto the bench
 *  (positionId === null), which the roster-comparison phases require. */
const MAX_ROSTER_SIZE = 15;
/** Two teams → exactly one head-to-head matchup per week. */
const NUMBER_OF_TEAMS = 2;

export interface ProvisionedMatchup {
  leagueId: number;
  matchupId: number;
  /** True when the matchup has at least one bench player (positionId === null). */
  hasBenchPlayers: boolean;
}

export interface ProvisionArgs {
  /** Commissioner JWT — owns the league and makes all draft picks. */
  commissionerJwt: string;
  /** Manager JWT — joins to fill the second team. */
  managerJwt: string;
  /** League name; should contain the `E2E <timestamp>` marker for sweep eligibility. */
  leagueName: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDraftStatus(
  jwt: string,
  leagueId: number,
  target: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await gqlFetch<{ league: { draftStatus: string } | null }>(
      jwt,
      `query DraftStatus($id: Int!) { league(id: $id) { draftStatus } }`,
      { id: leagueId },
    ).catch(() => null);
    if (data?.league?.draftStatus === target) return;
    await delay(2_000);
  }
  throw new Error(
    `[provisionCompletedMatchup] draftStatus did not reach '${target}' for league ${leagueId} within ${timeoutMs}ms`,
  );
}

export async function provisionCompletedMatchup(
  args: ProvisionArgs,
): Promise<ProvisionedMatchup> {
  const { commissionerJwt, managerJwt, leagueName } = args;

  // No free-tier slot clearing (LS-8057): both identities are premium now, so
  // neither league creation nor joining trips the 3-league cap. Clearing slots
  // against these shared premium identities would be unsafe — the helper has no
  // age guard and would delete leagues that concurrent shards are mid-test on.

  // 1. Create the league + teams.
  const created = await gqlFetch<{
    createLeagueAndTeams: {
      league: { id: number; inviteCode: string };
    };
  }>(
    commissionerJwt,
    `mutation CreateLeague($input: CreateLeagueAndTeamsInput!) {
       createLeagueAndTeams(input: $input) {
         league { id inviteCode }
       }
     }`,
    {
      input: {
        leagueName,
        numberOfTeams: NUMBER_OF_TEAMS,
        numberOfDivisions: 1,
        maxRosterSize: MAX_ROSTER_SIZE,
        playerPool: 'all',
      },
    },
  );
  const leagueId = Number(created.createLeagueAndTeams.league.id);
  const inviteCode = created.createLeagueAndTeams.league.inviteCode;

  // 2. Shorten the season to a single one-game week with no playoffs so it can
  //    be driven to completion in one autoSelect + autoAdvance cycle.
  await gqlFetch(
    commissionerJwt,
    `mutation SetSettings($input: UpdateLeagueSettingsInput!) {
       updateLeagueSettings(input: $input) { id }
     }`,
    {
      input: {
        leagueId,
        totalMatchups: 1,
        gamesPerMatchup: 1,
        playoffEnabled: false,
      },
    },
  );

  // 3. Manager joins to fill the second team.
  await gqlFetch(
    managerJwt,
    `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
       joinLeague(inviteCode: $inviteCode, teamName: $teamName) { teamId }
     }`,
    { inviteCode, teamName: 'Recap Opponent' },
  );

  // 4. Run the draft to completion (fills every roster → bench players exist).
  const draft = await gqlFetch<{ initializeDraft: { id: number } }>(
    commissionerJwt,
    `mutation InitDraft($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
       initializeDraft(leagueId: $leagueId, draftMode: $draftMode, selectionMethod: $selectionMethod, draftOrder: $draftOrder) { id }
     }`,
    {
      leagueId,
      draftMode: 'live',
      selectionMethod: 'standard',
      draftOrder: 'snake',
    },
  );
  const draftId = Number(draft.initializeDraft.id);

  await gqlFetch(
    commissionerJwt,
    `mutation RandomizeOrder($draftId: Int!) { randomizeDraftOrder(draftId: $draftId) { id } }`,
    { draftId },
  );

  const orderData = await gqlFetch<{
    getDraftTeamOrder: Array<{ teamId: number }>;
  }>(
    commissionerJwt,
    `query DraftOrder($draftId: Int!) { getDraftTeamOrder(draftId: $draftId) { teamId } }`,
    { draftId },
  );
  const numTeams = orderData.getDraftTeamOrder.length;

  await gqlFetch(
    commissionerJwt,
    `mutation StartDraft($leagueId: Int!) { startDraft(leagueId: $leagueId) { id draftStatus } }`,
    { leagueId },
  );
  await pollDraftStatus(commissionerJwt, leagueId, 'in-progress', 60_000);

  const avail = await gqlFetch<{
    getAvailableDraftPlayers: Array<{ id: number }>;
  }>(
    commissionerJwt,
    `query AvailablePlayers($draftId: Int!) { getAvailableDraftPlayers(draftId: $draftId) { id } }`,
    { draftId },
  );
  const pool = avail.getAvailableDraftPlayers;
  const totalPicks = numTeams * MAX_ROSTER_SIZE;
  for (let i = 0; i < totalPicks && i < pool.length; i++) {
    await gqlFetch(
      commissionerJwt,
      `mutation Pick($draftId: Int!, $playerId: Int!) {
         commissionerPick(draftId: $draftId, playerId: $playerId) { playerId }
       }`,
      { draftId, playerId: pool[i].id },
    );
  }
  await pollDraftStatus(commissionerJwt, leagueId, 'completed', 120_000);

  // 5. Create matchups, play the single game, advance the (final) week so the
  //    matchup transitions to 'completed' and a recap becomes available.
  await gqlFetch(
    commissionerJwt,
    `mutation CreateMatchups($leagueId: Int!) {
       createAllMatchups(leagueId: $leagueId) { matchups { id } }
     }`,
    { leagueId },
  );

  await gqlFetch(
    commissionerJwt,
    `mutation AutoSelect($leagueId: Int) { autoSelectGames(leagueId: $leagueId) { gamesTriggered } }`,
    { leagueId },
  );
  // Wait for the async stats-hydration pipeline that autoSelectGames enqueues
  // (game-selection → ~4 FIFO batches of 8 players → single-concurrency
  // stats-lambda downloads each uncached game log from Baseball Reference at
  // ~12s/player). Liveness is judged per player, so a stuck pipeline fails
  // fast; see wait-for-stats-hydrated.ts.
  await waitForWeekStatsHydrated(commissionerJwt, leagueId, 1, {
    label: 'provisionCompletedMatchup',
  });

  await gqlFetch(
    commissionerJwt,
    `mutation AutoAdvance($leagueId: Int) { autoAdvanceMatchups(leagueId: $leagueId) { leaguesAdvanced } }`,
    { leagueId },
  );

  // 6. Locate the completed matchup and confirm it carries bench players.
  const matchupsData = await gqlFetch<{
    getMatchupsForLeague: Array<{ id: string; status: string }>;
  }>(
    commissionerJwt,
    `query Matchups($leagueId: Int!, $weekNumber: Int) {
       getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id status }
     }`,
    { leagueId, weekNumber: 1 },
  );
  const completed = matchupsData.getMatchupsForLeague.find(
    (m) => m.status === 'completed',
  );
  if (!completed) {
    throw new Error(
      `[provisionCompletedMatchup] no completed matchup found for league ${leagueId} after advancing week 1`,
    );
  }
  const matchupId = Number(completed.id);

  const players = await gqlFetch<{
    getMatchupPlayers: Array<{ positionId: number | null }>;
  }>(
    commissionerJwt,
    `query MatchupPlayers($matchupId: Int!) {
       getMatchupPlayers(matchupId: $matchupId) { positionId }
     }`,
    { matchupId },
  );
  const hasBenchPlayers = (players.getMatchupPlayers ?? []).some(
    (p) => p.positionId === null,
  );

  LOGGER.info(
    `[provisionCompletedMatchup] league ${leagueId} matchup ${matchupId} completed (hasBenchPlayers=${hasBenchPlayers})`,
  );

  return { leagueId, matchupId, hasBenchPlayers };
}
