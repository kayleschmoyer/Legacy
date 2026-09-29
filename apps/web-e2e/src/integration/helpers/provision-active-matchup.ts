import { gqlFetch } from './gql-fetch';
import {
  provisionDraftedLeague,
  type ProvisionDraftedLeagueArgs,
} from './provision-drafted-league';

/**
 * API-driven provisioning of a SCHEDULED (not completed) week-1 matchup with
 * full rosters (LS-9738 — `TestData.seasonActiveMatchup()`'s live
 * implementation, `fixtures/test-data.ts`).
 *
 * A direct sibling of `provision-completed-matchup.ts`'s
 * `provisionCompletedMatchup` (LS-7704) — its "create → join → draft" prefix
 * is `provisionDraftedLeague` (LS-10228) — but stops right after
 * `createAllMatchups`: it deliberately
 * never calls `autoSelectGames`/`autoAdvanceMatchups`, so the matchup stays
 * `scheduled` (unlocked) rather than progressing to `in_progress`/`completed`.
 * That is what `matchup-roster-editor.dual.spec.ts` needs (the server rejects
 * roster mutations against a locked matchup) and what a fresh week-1 matchup
 * naturally is — no stats-hydration wait needed either.
 */

export interface ProvisionedActiveMatchup {
  leagueId: number;
  inviteCode: string;
  commissionerTeamId: number;
  memberTeamId: number;
  matchupId: number;
}

export type ProvisionActiveMatchupArgs = ProvisionDraftedLeagueArgs;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const { commissionerJwt } = args;

  // 1–3. Create, join, and draft to completion (LS-10228 extraction).
  const { leagueId, inviteCode, commissionerTeamId, memberTeamId } =
    await provisionDraftedLeague(args);

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
