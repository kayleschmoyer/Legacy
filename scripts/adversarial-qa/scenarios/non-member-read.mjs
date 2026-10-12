// Can a user with no relationship to the league read its private data?

export const title =
  'non-member-read: standings/analytics readable by a non-member';
export const severity = 'Medium';

export async function run({ gql, league }) {
  const standings = await gql(
    'nonMember',
    `query($l:Int!){ getLeagueStandings(leagueId:$l) { teamId } }`,
    { l: league.id },
  );
  const analytics = await gql(
    'nonMember',
    `query($l:Int!){ getLeagueAnalytics(leagueId:$l) { leagueName } }`,
    { l: league.id },
  );

  const standingsLeaked =
    Array.isArray(standings.data?.getLeagueStandings) &&
    standings.data.getLeagueStandings.length > 0;
  const analyticsLeaked = !!analytics.data?.getLeagueAnalytics;

  return {
    exploited: standingsLeaked || analyticsLeaked,
    detail:
      `standings leaked=${standingsLeaked} (${JSON.stringify(standings.errors ?? standings.data).slice(0, 150)}); ` +
      `analytics leaked=${analyticsLeaked} (${JSON.stringify(analytics.errors ?? analytics.data).slice(0, 150)})`,
  };
}
