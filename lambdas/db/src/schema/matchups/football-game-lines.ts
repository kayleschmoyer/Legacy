/**
 * Football per-game stat lines shared by the matchup box score
 * (`matchupScores`) and its season-to-date totals (LS-10823): the GraphQL
 * stat-group shapes, the DB-row adapters that fill them, and the
 * data-quality severity ordering (LS-6394).
 *
 * Kept free of the Pothos builder so the DataLoader layer can import it.
 */

import {
  type FootballGameStatsDataQuality,
  PublicSchema,
} from '@legacy-sports/db-client';

/** Roster position types scored as individual defensive players. */
const IDP_POSITION_TYPES = new Set(['DL', 'LB', 'DB', 'DP']);

/** True when a roster position type is scored with IDP scoring. */
export function isIdpPositionType(positionType: string | null): boolean {
  return positionType !== null && IDP_POSITION_TYPES.has(positionType);
}

// ─── Stat-group shapes ───────────────────────────────────────────────────────

export type GamePassingShape = {
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
};

export type GameRushingShape = {
  att: number | null;
  yds: number | null;
  td: number | null;
};

export type GameReceivingShape = {
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
};

export type GameKickingShape = {
  fgm: number | null;
  fga: number | null;
  xpm: number | null;
  xpa: number | null;
};

export type GameDefenseShape = {
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowed: number | null;
  ydsAllowed: number | null;
};

export type GameIDPShape = {
  soloTkl: number | null;
  astTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
};

// ─── DB-to-GraphQL adapters ──────────────────────────────────────────────────
//
// Scoring reads the stat rows through `computeFootballPlayerGamePoints`'s own
// mapping (LS-9672); these shape the same rows for the GraphQL response.

export type OffenseRow =
  typeof PublicSchema.gameFootballPlayerOffenseStats.$inferSelect;

export function adaptDefenseRow(
  row: typeof PublicSchema.gameFootballDefense.$inferSelect,
): GameDefenseShape {
  return {
    sacks: row.sacks ?? null,
    int: row.interceptions ?? null,
    fumRec: row.fumblesRec ?? null,
    defTd: row.defTd ?? null,
    safeties: row.safeties ?? null,
    ptsAllowed: row.ptsAllowed ?? null,
    ydsAllowed: row.ydsAllowed ?? null,
  };
}

export function adaptIdpRow(
  row: typeof PublicSchema.gameFootballDefenseIdp.$inferSelect,
): GameIDPShape {
  return {
    soloTkl: row.soloTkl ?? null,
    astTkl: row.astTkl ?? null,
    sacks:
      row.sacks !== null && row.sacks !== undefined
        ? parseFloat(String(row.sacks))
        : null,
    int: row.interceptions ?? null,
    pd: row.pd ?? null,
    ff: row.ff ?? null,
    fr: row.fr ?? null,
    defTd: row.defTd ?? null,
    safeties: row.safeties ?? null,
  };
}

export function adaptPassingFromOffense(row: OffenseRow): GamePassingShape {
  return {
    cmp: row.cmp ?? null,
    att: row.passAtt ?? null,
    yds: row.passYds ?? null,
    td: row.passTd ?? null,
    int: row.interceptions ?? null,
  };
}

export function adaptRushingFromOffense(row: OffenseRow): GameRushingShape {
  return {
    att: row.rushAtt ?? null,
    yds: row.rushYds ?? null,
    td: row.rushTd ?? null,
  };
}

export function adaptReceivingFromOffense(row: OffenseRow): GameReceivingShape {
  return {
    rec: row.rec ?? null,
    tgt: row.tgt ?? null,
    yds: row.recYds ?? null,
    td: row.recTd ?? null,
  };
}

export function adaptKickingFromOffense(row: OffenseRow): GameKickingShape {
  return {
    fgm: row.fgm ?? null,
    fga: row.fga ?? null,
    xpm: row.xpm ?? null,
    xpa: row.xpa ?? null,
  };
}

// ─── Data quality (LS-6394) ──────────────────────────────────────────────────

/**
 * Severity order for `FootballGameStatsDataQuality`. A player's reported
 * quality is the worst across their scheduled games, so one missing game is
 * never masked by another game that loaded fine.
 */
const DATA_QUALITY_SEVERITY: Record<FootballGameStatsDataQuality, number> = {
  ok: 0,
  stats_pending: 1,
  stats_failed: 2,
  stats_missing: 3,
};

/** Return whichever of the two states is more severe. */
export function worseDataQuality(
  a: FootballGameStatsDataQuality,
  b: FootballGameStatsDataQuality,
): FootballGameStatsDataQuality {
  return DATA_QUALITY_SEVERITY[b] > DATA_QUALITY_SEVERITY[a] ? b : a;
}
