// Fires two near-simultaneous forceAddPlayer calls for the same player onto
// two different teams in the same league, as the commissioner (owner).
// A correct implementation lets exactly one succeed; a race in the
// add-player path lets both succeed and duplicates the player on two
// rosters (see lambdas/db/src/services/waiver-processor.ts's check-then-act
// pattern, which this scenario's shape mirrors for forceAddPlayer instead).

export const title =
  'race-double-claim: two concurrent forceAddPlayer calls can double-roster a player';
export const severity = 'High';

export async function run({ gqlRace, league, teams, playerId }) {
  const mutation = `mutation($l:Int!,$t:Int!,$p:Int!){
    forceAddPlayer(input:{leagueId:$l, teamId:$t, playerId:$p, reason:"adversarial-qa race"}) { success message }
  }`;

  const [onOwnerTeam, onOutsiderTeam] = await Promise.all([
    gqlRace(
      'owner',
      mutation,
      { l: league.id, t: teams.owner, p: playerId },
      1,
    ).then((r) => r[0]),
    gqlRace(
      'owner',
      mutation,
      { l: league.id, t: teams.outsider, p: playerId },
      1,
    ).then((r) => r[0]),
  ]);

  const ownerOk = onOwnerTeam.data?.forceAddPlayer?.success === true;
  const outsiderOk = onOutsiderTeam.data?.forceAddPlayer?.success === true;
  const bothSucceeded = ownerOk && outsiderOk;

  return {
    exploited: bothSucceeded,
    detail: bothSucceeded
      ? `player ${playerId} was added to BOTH team ${teams.owner} and team ${teams.outsider} from concurrent requests`
      : `only one side succeeded as expected (owner=${ownerOk}, outsider=${outsiderOk})`,
  };
}
