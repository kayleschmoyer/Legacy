/**
 * Maps GraphQL stat field names (camelCase) to scoring format (database short names)
 *
 * The GraphQL API returns stats with descriptive camelCase names (e.g., homeRuns, strikeouts),
 * but the scoring system expects database column names (e.g., hr, so).
 */

import type {
  GameBatting,
  GameFielding,
  GamePitching,
} from '../../api/db/graphql.generated';

export interface ScoringBattingStats {
  [key: string]: number | null | undefined;
  r?: number | null;
  h?: number | null;
  doubles?: number | null;
  triples?: number | null;
  hr?: number | null;
  rbi?: number | null;
  sb?: number | null;
  cs?: number | null;
  bb?: number | null;
  so?: number | null;
  hbp?: number | null;
  gidp?: number | null;
  ibb?: number | null;
  sh?: number | null;
  sf?: number | null;
  ab?: number | null;
  pa?: number | null;
}

export interface ScoringPitchingStats {
  [key: string]: number | null | undefined;
  w?: number | null;
  l?: number | null;
  gs?: number | null;
  gf?: number | null;
  cg?: number | null;
  sho?: number | null;
  sv?: number | null;
  ip?: number | null;
  h?: number | null;
  r?: number | null;
  er?: number | null;
  hr?: number | null;
  bb?: number | null;
  ibb?: number | null;
  so?: number | null;
  hbp?: number | null;
  battersFaced?: number | null;
  outsRecorded?: number | null;
}

export interface ScoringFieldingStats {
  [key: string]: number | null | undefined;
  innDef?: number | null;
  chances?: number | null;
  po?: number | null;
  a?: number | null;
  eDef?: number | null;
  dpDef?: number | null;
}

/**
 * Maps GraphQL GameBatting to scoring format
 */
export function mapBattingStats(
  graphqlStats: GameBatting | null | undefined,
): ScoringBattingStats | null {
  if (!graphqlStats) return null;

  return {
    pa: graphqlStats.plateAppearances,
    ab: graphqlStats.atBats,
    r: graphqlStats.runs,
    h: graphqlStats.hits,
    doubles: graphqlStats.doubles,
    triples: graphqlStats.triples,
    hr: graphqlStats.homeRuns,
    rbi: graphqlStats.rbi,
    sb: graphqlStats.stolenBases,
    cs: graphqlStats.caughtStealing,
    bb: graphqlStats.baseOnBalls,
    so: graphqlStats.strikeouts,
    gidp: graphqlStats.groundedIntoDoublePlays,
    hbp: graphqlStats.hitByPitch,
    sh: graphqlStats.sacrificeHits,
    // sacrificeFlies is typed as string in GraphQL for some reason, so we need to parse it
    sf: graphqlStats.sacrificeFlies
      ? parseInt(graphqlStats.sacrificeFlies, 10) || null
      : null,
    ibb: graphqlStats.intentionalBaseOnBalls,
  };
}

/**
 * Maps GraphQL GamePitching to scoring format
 */
export function mapPitchingStats(
  graphqlStats: GamePitching | null | undefined,
): ScoringPitchingStats | null {
  if (!graphqlStats) return null;

  return {
    w: graphqlStats.wins,
    l: graphqlStats.losses,
    gs: graphqlStats.gamesStarted,
    gf: graphqlStats.gamesFinished,
    cg: graphqlStats.completeGames,
    sho: graphqlStats.shutouts,
    sv: graphqlStats.saves,
    ip: graphqlStats.inningsPitched,
    h: graphqlStats.hits,
    r: graphqlStats.runs,
    er: graphqlStats.earnedRuns,
    hr: graphqlStats.homeRuns,
    bb: graphqlStats.baseOnBalls,
    ibb: graphqlStats.intentionalBaseOnBalls,
    so: graphqlStats.strikeouts,
    hbp: graphqlStats.hitByPitch,
    battersFaced: graphqlStats.battersFaced,
    outsRecorded: graphqlStats.outsRecorded,
  };
}

/**
 * Maps GraphQL GameFielding to scoring format
 */
export function mapFieldingStats(
  graphqlStats: GameFielding | null | undefined,
): ScoringFieldingStats | null {
  if (!graphqlStats) return null;

  return {
    innDef: graphqlStats.inningsPlayed,
    chances: null, // Not available in GraphQL
    po: graphqlStats.putouts,
    a: graphqlStats.assists,
    eDef: graphqlStats.errors,
    dpDef: graphqlStats.doublePlays,
  };
}
