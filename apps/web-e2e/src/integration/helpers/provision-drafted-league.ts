import { gqlFetch } from './gql-fetch';

/**
 * API-driven provisioning of a 2-team league whose draft has COMPLETED
 * (LS-10228): create → join → initializeDraft → randomize → startDraft →
 * commissionerPick every slot → poll `draftStatus === 'completed'`.
 *
 * Completing the draft is what moves the league to `league_phase = 'active'`
 * (`lambdas/db/src/schema/drafts/helpers.ts`), the precondition every
 * in-season mutation checks — e.g. `claimFreeAgent`
 * (`lambdas/db/src/schema/waivers/mutations.ts`) rejects claims until then.
 * Draft rounds = `maxRosterSize`, so every roster is FULL afterwards; callers
 * that add a player must also drop one (see `rosterByTeamId`).
 *
 * Shared by `provisionActiveMatchup` (LS-9738) and
 * `LiveTestData.waiverQueue()` (`fixtures/test-data.ts`).
 */

export const DRAFTED_LEAGUE_MAX_ROSTER_SIZE = 15;
const NUMBER_OF_TEAMS = 2;

export interface ProvisionedDraftedLeague {
  leagueId: number;
  inviteCode: string;
  commissionerTeamId: number;
  memberTeamId: number;
  /** Player ids drafted onto each team, keyed by team id, in pick order. */
  rosterByTeamId: Record<number, number[]>;
}

export interface ProvisionDraftedLeagueArgs {
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
      `query DraftStatusForDraftedLeague($id: Int!) { league(id: $id) { draftStatus } }`,
      { id: leagueId },
    ).catch(() => null);
    if (data?.league?.draftStatus === target) return;
    await delay(2_000);
  }
  throw new Error(
    `[provisionDraftedLeague] draftStatus did not reach '${target}' for league ${leagueId} within ${timeoutMs}ms`,
  );
}

export async function provisionDraftedLeague(
  args: ProvisionDraftedLeagueArgs,
): Promise<ProvisionedDraftedLeague> {
  const { commissionerJwt, memberJwt, leagueName } = args;

  // 1. Create the league + teams.
  const created = await gqlFetch<{
    createLeagueAndTeams: { league: { id: number; inviteCode: string } };
  }>(
    commissionerJwt,
    `mutation CreateLeagueForDraftedLeague($input: CreateLeagueAndTeamsInput!) {
       createLeagueAndTeams(input: $input) {
         league { id inviteCode }
       }
     }`,
    {
      input: {
        leagueName,
        numberOfTeams: NUMBER_OF_TEAMS,
        numberOfDivisions: 1,
        maxRosterSize: DRAFTED_LEAGUE_MAX_ROSTER_SIZE,
        playerPool: 'all',
      },
    },
  );
  const leagueId = Number(created.createLeagueAndTeams.league.id);
  const inviteCode = created.createLeagueAndTeams.league.inviteCode;

  // 2. The member identity joins to fill the second team.
  const joined = await gqlFetch<{ joinLeagueByCode: { id: number } }>(
    memberJwt,
    `mutation JoinLeagueForDraftedLeague($inviteCode: String!, $teamName: String!) {
       joinLeagueByCode(inviteCode: $inviteCode, teamName: $teamName) { id }
     }`,
    { inviteCode, teamName: `E2E Drafted League ${Date.now()}` },
  );
  const memberTeamId = Number(joined.joinLeagueByCode.id);

  const commissionerTeamId = await gqlFetch<{ userTeamId: number | null }>(
    commissionerJwt,
    `query CommissionerTeamIdForDraftedLeague($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
    { leagueId },
  ).then((r) => {
    if (r.userTeamId == null) {
      throw new Error(
        `[provisionDraftedLeague] userTeamId(leagueId: ${leagueId}) returned null for the commissioner`,
      );
    }
    return r.userTeamId;
  });

  // 3. Run an automated (commissioner-driven) draft to completion — fills
  //    every roster so both teams have starters and bench players.
  const draft = await gqlFetch<{ initializeDraft: { id: number } }>(
    commissionerJwt,
    `mutation InitDraftForDraftedLeague($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
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
    `mutation RandomizeOrderForDraftedLeague($draftId: Int!) { randomizeDraftOrder(draftId: $draftId) { id } }`,
    { draftId },
  );

  const orderData = await gqlFetch<{
    getDraftTeamOrder: Array<{ teamId: number }>;
  }>(
    commissionerJwt,
    `query DraftOrderForDraftedLeague($draftId: Int!) { getDraftTeamOrder(draftId: $draftId) { teamId } }`,
    { draftId },
  );
  const numTeams = orderData.getDraftTeamOrder.length;

  await gqlFetch(
    commissionerJwt,
    `mutation StartDraftForDraftedLeague($leagueId: Int!) { startDraft(leagueId: $leagueId) { id draftStatus } }`,
    { leagueId },
  );
  await pollDraftStatus(commissionerJwt, leagueId, 'in-progress', 60_000);

  const avail = await gqlFetch<{
    getAvailableDraftPlayers: Array<{ id: number }>;
  }>(
    commissionerJwt,
    `query AvailablePlayersForDraftedLeague($draftId: Int!) { getAvailableDraftPlayers(draftId: $draftId) { id } }`,
    { draftId },
  );
  const pool = avail.getAvailableDraftPlayers;
  const totalPicks = numTeams * DRAFTED_LEAGUE_MAX_ROSTER_SIZE;
  const rosterByTeamId: Record<number, number[]> = {
    [commissionerTeamId]: [],
    [memberTeamId]: [],
  };
  for (let i = 0; i < totalPicks && i < pool.length; i++) {
    const { commissionerPick } = await gqlFetch<{
      commissionerPick: { playerId: number; teamId: number };
    }>(
      commissionerJwt,
      `mutation PickForDraftedLeague($draftId: Int!, $playerId: Int!) {
         commissionerPick(draftId: $draftId, playerId: $playerId) { playerId teamId }
       }`,
      { draftId, playerId: pool[i].id },
    );
    (rosterByTeamId[Number(commissionerPick.teamId)] ??= []).push(
      Number(commissionerPick.playerId),
    );
  }
  // Completion (and the league_phase → 'active' flip) lands asynchronously
  // after the last pick — this poll is the real precondition gate.
  await pollDraftStatus(commissionerJwt, leagueId, 'completed', 120_000);

  return {
    leagueId,
    inviteCode,
    commissionerTeamId,
    memberTeamId,
    rosterByTeamId,
  };
}
