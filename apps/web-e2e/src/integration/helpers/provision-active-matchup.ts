import { gqlFetch } from './gql-fetch';

/**
 * API-driven provisioning of a SCHEDULED (not completed) week-1 matchup with
 * full rosters (LS-9738 — `TestData.seasonActiveMatchup()`'s live
 * implementation, `fixtures/test-data.ts`).
 *
 * A direct sibling of `provision-completed-matchup.ts`'s
 * `provisionCompletedMatchup` (LS-7704) — reuses the same "create → join →
 * draft" shape — but stops right after `createAllMatchups`: it deliberately
 * never calls `autoSelectGames`/`autoAdvanceMatchups`, so the matchup stays
 * `scheduled` (unlocked) rather than progressing to `in_progress`/`completed`.
 * That is what `matchup-roster-editor.dual.spec.ts` needs (the server rejects
 * roster mutations against a locked matchup) and what a fresh week-1 matchup
 * naturally is — no stats-hydration wait needed either.
 */

const MAX_ROSTER_SIZE = 15;
const NUMBER_OF_TEAMS = 2;

export interface ProvisionedActiveMatchup {
  leagueId: number;
  inviteCode: string;
  commissionerTeamId: number;
  memberTeamId: number;
  matchupId: number;
}

export interface ProvisionActiveMatchupArgs {
  /** Commissioner JWT — owns the league and makes all draft picks. */
  commissionerJwt: string;
  /** Member JWT — joins to fill the second team. */
  memberJwt: string;
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
      `query DraftStatusForActiveMatchup($id: Int!) { league(id: $id) { draftStatus } }`,
      { id: leagueId },
    ).catch(() => null);
    if (data?.league?.draftStatus === target) return;
    await delay(2_000);
  }
  throw new Error(
    `[provisionActiveMatchup] draftStatus did not reach '${target}' for league ${leagueId} within ${timeoutMs}ms`,
  );
}

/**
 * Poll until the commissioner's team has at least one starter — mirrors the
 * GQL consistency gate the live integration specs run before touching the
 * matchup-detail/roster-editor UI, since `autoPopulateFirstMatchupLineup`
 * runs asynchronously after draft completion.
 */
async function pollCommissionerHasStarter(
  jwt: string,
  matchupId: number,
  commissionerTeamId: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await gqlFetch<{
      getMatchupPlayers: Array<{ teamId: number; positionId: number | null }>;
    }>(
      jwt,
      `query MatchupStartersForActiveMatchup($matchupId: Int!) {
         getMatchupPlayers(matchupId: $matchupId) { teamId positionId }
       }`,
      { matchupId },
    ).catch(() => null);
    const players = data?.getMatchupPlayers ?? [];
    if (
      players.some(
        (p) => p.teamId === commissionerTeamId && p.positionId !== null,
      )
    ) {
      return;
    }
    await delay(2_000);
  }
  throw new Error(
    `[provisionActiveMatchup] commissioner team ${commissionerTeamId} never got a starter in matchup ${matchupId} within ${timeoutMs}ms`,
  );
}

export async function provisionActiveMatchup(
  args: ProvisionActiveMatchupArgs,
): Promise<ProvisionedActiveMatchup> {
  const { commissionerJwt, memberJwt, leagueName } = args;

  // 1. Create the league + teams.
  const created = await gqlFetch<{
    createLeagueAndTeams: { league: { id: number; inviteCode: string } };
  }>(
    commissionerJwt,
    `mutation CreateLeagueForActiveMatchup($input: CreateLeagueAndTeamsInput!) {
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

  // 2. The member identity joins to fill the second team.
  const joined = await gqlFetch<{ joinLeagueByCode: { id: number } }>(
    memberJwt,
    `mutation JoinLeagueForActiveMatchup($inviteCode: String!, $teamName: String!) {
       joinLeagueByCode(inviteCode: $inviteCode, teamName: $teamName) { id }
     }`,
    { inviteCode, teamName: `E2E Active Matchup ${Date.now()}` },
  );
  const memberTeamId = Number(joined.joinLeagueByCode.id);

  const commissionerTeamId = await gqlFetch<{ userTeamId: number | null }>(
    commissionerJwt,
    `query CommissionerTeamIdForActiveMatchup($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
    { leagueId },
  ).then((r) => {
    if (r.userTeamId == null) {
      throw new Error(
        `[provisionActiveMatchup] userTeamId(leagueId: ${leagueId}) returned null for the commissioner`,
      );
    }
    return r.userTeamId;
  });

  // 3. Run an automated (commissioner-driven) draft to completion — fills
  //    every roster so both teams have starters and bench players.
  const draft = await gqlFetch<{ initializeDraft: { id: number } }>(
    commissionerJwt,
    `mutation InitDraftForActiveMatchup($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
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
    `mutation RandomizeOrderForActiveMatchup($draftId: Int!) { randomizeDraftOrder(draftId: $draftId) { id } }`,
    { draftId },
  );

  const orderData = await gqlFetch<{
    getDraftTeamOrder: Array<{ teamId: number }>;
  }>(
    commissionerJwt,
    `query DraftOrderForActiveMatchup($draftId: Int!) { getDraftTeamOrder(draftId: $draftId) { teamId } }`,
    { draftId },
  );
  const numTeams = orderData.getDraftTeamOrder.length;

  await gqlFetch(
    commissionerJwt,
    `mutation StartDraftForActiveMatchup($leagueId: Int!) { startDraft(leagueId: $leagueId) { id draftStatus } }`,
    { leagueId },
  );
  await pollDraftStatus(commissionerJwt, leagueId, 'in-progress', 60_000);

  const avail = await gqlFetch<{
    getAvailableDraftPlayers: Array<{ id: number }>;
  }>(
    commissionerJwt,
    `query AvailablePlayersForActiveMatchup($draftId: Int!) { getAvailableDraftPlayers(draftId: $draftId) { id } }`,
    { draftId },
  );
  const pool = avail.getAvailableDraftPlayers;
  const totalPicks = numTeams * MAX_ROSTER_SIZE;
  for (let i = 0; i < totalPicks && i < pool.length; i++) {
    await gqlFetch(
      commissionerJwt,
      `mutation PickForActiveMatchup($draftId: Int!, $playerId: Int!) {
         commissionerPick(draftId: $draftId, playerId: $playerId) { playerId }
       }`,
      { draftId, playerId: pool[i].id },
    );
  }
  await pollDraftStatus(commissionerJwt, leagueId, 'completed', 120_000);

  // 4. Create week-1 matchups (left `scheduled` — no autoSelectGames call).
  await gqlFetch(
    commissionerJwt,
    `mutation CreateMatchupsForActiveMatchup($leagueId: Int!) {
       createAllMatchups(leagueId: $leagueId) { matchups { id } }
     }`,
    { leagueId },
  );

  const matchupsData = await gqlFetch<{
    getMatchupsForLeague: Array<{
      id: string;
      team1Id: number;
      team2Id: number;
    }>;
  }>(
    commissionerJwt,
    `query MatchupsForActiveMatchup($leagueId: Int!, $weekNumber: Int) {
       getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id team1Id team2Id }
     }`,
    { leagueId, weekNumber: 1 },
  );
  const matchup = matchupsData.getMatchupsForLeague.find(
    (m) => m.team1Id === commissionerTeamId || m.team2Id === commissionerTeamId,
  );
  if (!matchup) {
    throw new Error(
      `[provisionActiveMatchup] no week-1 matchup found for commissioner team ${commissionerTeamId} in league ${leagueId}`,
    );
  }
  const matchupId = Number(matchup.id);

  // autoPopulateFirstMatchupLineup runs asynchronously after draft
  // completion — wait for it before handing the matchup back.
  await pollCommissionerHasStarter(
    commissionerJwt,
    matchupId,
    commissionerTeamId,
    60_000,
  );

  return { leagueId, inviteCode, commissionerTeamId, memberTeamId, matchupId };
}
