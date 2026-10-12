// Can a non-commissioner member trigger a commissioner-only system action?
//
// autoAdvanceMatchups is meant to be commissioner-gated (matchups/system-auth.ts).
// `outsider` here is a general_manager, never the commissioner.

export const title =
  'commissioner-bypass: non-commissioner calls autoAdvanceMatchups';
export const severity = 'High';

export async function run({ gql, league }) {
  const r = await gql(
    'outsider',
    `mutation($l:Int!){ autoAdvanceMatchups(leagueId:$l) { __typename } }`,
    { l: league.id },
  );

  const succeeded = !r.errors && r.data?.autoAdvanceMatchups != null;

  return {
    exploited: succeeded,
    detail: succeeded
      ? `outsider successfully called autoAdvanceMatchups on a league they do not own`
      : `blocked as expected: ${JSON.stringify(r.errors ?? r.data)}`,
  };
}
