// Can an ordinary team manager mutate a *different* team they don't own?
//
// Ground truth this scenario is checking (lambdas/db/src/schema/authorization.ts
// isCommissionerOrOwner / verifyTeamEditAccess): a `general_manager` is meant
// to control only their own team. Every league joiner is granted
// `general_manager`, so if the own-team check is missing, this scenario
// passes the attack and the finding is real, not a reading of the code.

export const title =
  'cross-team-mutation: outsider renames/edits a team they do not own';
export const severity = 'Critical';

export async function run({ gql, league, teams }) {
  const victimTeamId = teams.owner;
  const r1 = await gql(
    'outsider',
    `mutation($l:Int!,$t:Int!,$n:String!){ renameTeam(leagueId:$l, teamId:$t, newName:$n) { id name } }`,
    { l: league.id, t: victimTeamId, n: 'PWNED-BY-ADVERSARIAL-QA' },
  );

  const renamed = r1.data?.renameTeam?.name === 'PWNED-BY-ADVERSARIAL-QA';

  return {
    exploited: renamed,
    detail: renamed
      ? `outsider (team ${teams.outsider}) renamed owner's team ${victimTeamId} via renameTeam with no authorization error`
      : `blocked as expected: ${JSON.stringify(r1.errors ?? r1.data)}`,
  };
}
