/**
 * Matchup player-stat mapping
 *
 * Turns rows from `getMatchupPlayerGameStats` into the `PlayerGameStats` shape
 * the matchup scoring engine consumes, partitioned by team.
 *
 * Extracted (LS-9532) from three byte-identical copies of this mapping that had
 * each been pasted alongside its own scoring setup, in the stats-lambda, the
 * game-selection season game selector and the commissioner recalculate tool
 * (whose TODO asked for exactly this). Copy-pasting the mapping while
 * re-deriving the surrounding scoring settings by hand is how that tool ended
 * up feeding snake_case multipliers into a camelCase lookup.
 *
 * Those three call sites now share one scoring function —
 * `@legacy-sports/scoring-utils` — which is this module's only caller in
 * application code. It stays here, in the database-free scoring library, so
 * the mapping can be unit-tested without a database.
 */

import type { PlayerGameStats } from './matchup-scoring';

/**
 * Structural shape of one row returned by `getMatchupPlayerGameStats`.
 *
 * Declared structurally rather than imported from `@legacy-sports/db-client` so
 * this module carries no database dependency. Drizzle rows carry extra columns
 * (`gameIdentifier`, `season`, …) and remain assignable to it.
 */
export interface MatchupPlayerGameStatRow {
  playerId: number;
  teamId: number | null;
  season: number;
  gameNum: number;
  battingStats: PlayerGameStats['batting'] | null;
  pitchingStats: PlayerGameStats['pitching'] | null;
  fieldingStats: PlayerGameStats['fielding'] | null;
}

export interface MatchupTeamPlayerGameStats {
  team1PlayerStats: Map<number, PlayerGameStats[]>;
  team2PlayerStats: Map<number, PlayerGameStats[]>;
}

/**
 * Project one stat row onto `PlayerGameStats`.
 *
 * The fields are picked explicitly rather than spread: the source rows also
 * carry numeric `season` / `gameNum` columns, and `aggregatePlayerStats` sums
 * every numeric key it is handed.
 */
export function toPlayerGameStats(
  row: MatchupPlayerGameStatRow,
): PlayerGameStats {
  return {
    playerId: row.playerId,
    season: row.season,
    gameNum: row.gameNum,
    batting: row.battingStats
      ? {
          pa: row.battingStats.pa,
          ab: row.battingStats.ab,
          r: row.battingStats.r,
          h: row.battingStats.h,
          doubles: row.battingStats.doubles,
          triples: row.battingStats.triples,
          hr: row.battingStats.hr,
          rbi: row.battingStats.rbi,
          sb: row.battingStats.sb,
          cs: row.battingStats.cs,
          bb: row.battingStats.bb,
          so: row.battingStats.so,
          gidp: row.battingStats.gidp,
          hbp: row.battingStats.hbp,
          sh: row.battingStats.sh,
          sf: row.battingStats.sf,
          ibb: row.battingStats.ibb,
        }
      : undefined,
    pitching: row.pitchingStats
      ? {
          w: row.pitchingStats.w,
          l: row.pitchingStats.l,
          gs: row.pitchingStats.gs,
          gf: row.pitchingStats.gf,
          cg: row.pitchingStats.cg,
          sho: row.pitchingStats.sho,
          sv: row.pitchingStats.sv,
          ip: row.pitchingStats.ip,
          h: row.pitchingStats.h,
          r: row.pitchingStats.r,
          er: row.pitchingStats.er,
          hr: row.pitchingStats.hr,
          bb: row.pitchingStats.bb,
          ibb: row.pitchingStats.ibb,
          so: row.pitchingStats.so,
          hbp: row.pitchingStats.hbp,
          battersFaced: row.pitchingStats.battersFaced,
          outsRecorded: row.pitchingStats.outsRecorded,
        }
      : undefined,
    fielding: row.fieldingStats
      ? {
          innDef: row.fieldingStats.innDef,
          chances: row.fieldingStats.chances,
          po: row.fieldingStats.po,
          a: row.fieldingStats.a,
          eDef: row.fieldingStats.eDef,
          dpDef: row.fieldingStats.dpDef,
        }
      : undefined,
  };
}

/**
 * Map stat rows to `PlayerGameStats` and bucket them by team, keyed by player.
 *
 * Rows whose `teamId` matches neither side are dropped, matching every caller's
 * prior behaviour.
 */
export function partitionMatchupPlayerGameStats(
  rows: readonly MatchupPlayerGameStatRow[],
  team1Id: number | null,
  team2Id: number | null,
): MatchupTeamPlayerGameStats {
  const team1PlayerStats = new Map<number, PlayerGameStats[]>();
  const team2PlayerStats = new Map<number, PlayerGameStats[]>();

  for (const row of rows) {
    const target =
      row.teamId === team1Id
        ? team1PlayerStats
        : row.teamId === team2Id
          ? team2PlayerStats
          : null;

    if (!target) continue;

    const playerGameStat = toPlayerGameStats(row);
    const existing = target.get(row.playerId);
    if (existing) {
      existing.push(playerGameStat);
    } else {
      target.set(row.playerId, [playerGameStat]);
    }
  }

  return { team1PlayerStats, team2PlayerStats };
}
