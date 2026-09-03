import type { StoredBatting, StoredFielding, StoredPitching } from './types';

/**
 * Retrosheet CSV -> target row shape.
 *
 * Kept in this library (rather than inside the ingest command) so the mapping
 * is unit-testable in isolation and so any future re-ingest tool shares one
 * definition of the transform.
 *
 * Source: the per-season archives at
 * `https://www.retrosheet.org/downloads/<YYYY>/<YYYY>csvs.zip`, members
 * `<YYYY>batting.csv`, `<YYYY>pitching.csv`, `<YYYY>fielding.csv`.
 */

/** A raw CSV record: every column arrives as a string. */
export type CsvRow = Record<string, string>;

function num(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Coerce to a number, treating blank/invalid as 0 (for summed fields). */
function numOr0(value: string | undefined): number {
  return num(value) ?? 0;
}

/**
 * Retrosheet reports outs; the column stores innings in baseball notation,
 * where the fraction digit counts outs (6.2 = six innings and two outs).
 *
 * This must match the generated column exactly:
 *   outs_recorded = floor(ip)*3 + (ip - floor(ip))*10
 * so 20 outs -> 6.2 -> 6*3 + 2 = 20.
 */
export function outsToInningsNotation(outs: number): number {
  const whole = Math.floor(outs / 3);
  const remainder = outs % 3;
  // One decimal place; guard against binary float drift (6 + 0.2 = 6.2).
  return Number((whole + remainder / 10).toFixed(1));
}

/** Only `value` rows are real stat lines; other stattypes are adjustments. */
export function isValueRow(row: CsvRow): boolean {
  return row['stattype'] === 'value';
}

export function toStoredBatting(
  row: CsvRow,
  season: number,
  gameNum: number,
): StoredBatting {
  return {
    season,
    gameNum,
    gameIdentifier: row['gid'],
    pa: num(row['b_pa']),
    ab: num(row['b_ab']),
    r: num(row['b_r']),
    h: num(row['b_h']),
    doubles: num(row['b_d']),
    triples: num(row['b_t']),
    hr: num(row['b_hr']),
    rbi: num(row['b_rbi']),
    sb: num(row['b_sb']),
    cs: num(row['b_cs']),
    bb: num(row['b_w']),
    so: num(row['b_k']),
    gidp: num(row['b_gdp']),
    hbp: num(row['b_hbp']),
    sh: num(row['b_sh']),
    // `sf` is varchar(10) in the schema while every sibling counting stat is
    // integer. Preserved as-is rather than silently changing the column type.
    sf: row['b_sf'] === '' || row['b_sf'] === undefined ? null : row['b_sf'],
    ibb: num(row['b_iw']),
  };
}

export function toStoredPitching(
  row: CsvRow,
  season: number,
  gameNum: number,
): StoredPitching {
  return {
    season,
    gameNum,
    gameIdentifier: row['gid'],
    // `wp`/`lp`/`save` are decision FLAGS on the pitcher's line. Note these are
    // distinct from `p_wp` (wild pitches) — an easy and silent transposition.
    w: numOr0(row['wp']),
    l: numOr0(row['lp']),
    sv: numOr0(row['save']),
    gs: num(row['p_gs']),
    gf: num(row['p_gf']),
    cg: num(row['p_cg']),
    // Retrosheet has no shutout flag on the pitching line. A shutout is a
    // complete game in which the pitcher allowed no runs, which is derivable
    // from the same row.
    sho: numOr0(row['p_cg']) === 1 && numOr0(row['p_r']) === 0 ? 1 : 0,
    ip: outsToInningsNotation(numOr0(row['p_ipouts'])),
    h: num(row['p_h']),
    r: num(row['p_r']),
    er: num(row['p_er']),
    hr: num(row['p_hr']),
    bb: num(row['p_w']),
    ibb: num(row['p_iw']),
    so: num(row['p_k']),
    hbp: num(row['p_hbp']),
    battersFaced: num(row['p_bfp']),
  };
}

/**
 * Fielding needs aggregation: Retrosheet emits one row per player per POSITION
 * per game, while `game_fielding` is keyed one row per player per game. Sum the
 * counting stats across positions.
 */
export function aggregateFielding(
  rows: CsvRow[],
  season: number,
  gameNum: number,
): StoredFielding {
  // Callers group by game, so this is non-empty in practice — but this is an
  // exported function, and reading rows[0] blindly would fail with an opaque
  // TypeError rather than naming the contract that was broken.
  if (rows.length === 0) {
    throw new Error('aggregateFielding requires at least one fielding row');
  }

  let ifouts = 0;
  let po = 0;
  let a = 0;
  let e = 0;
  let dp = 0;

  for (const row of rows) {
    ifouts += numOr0(row['d_ifouts']);
    po += numOr0(row['d_po']);
    a += numOr0(row['d_a']);
    e += numOr0(row['d_e']);
    dp += numOr0(row['d_dp']);
  }

  return {
    season,
    gameNum,
    gameIdentifier: rows[0]['gid'],
    // Defensive innings, same baseball notation as pitching's `ip`.
    innDef: outsToInningsNotation(ifouts),
    // Total chances is not a Retrosheet column; it is defined as
    // putouts + assists + errors.
    chances: po + a + e,
    po,
    a,
    eDef: e,
    dpDef: dp,
  };
}

/**
 * `game_number` is part of the primary key and is a per-player, per-season
 * sequence — it is NOT a Retrosheet field. Assign it by chronological order of
 * the games the player actually appeared in, which is what the scraper's
 * game-log ordering produced.
 *
 * `gid` embeds the date (`TTTYYYYMMDDG`), so sorting by `date` then `gid`
 * keeps doubleheaders in their played order.
 */
export function assignGameNumbers(rows: CsvRow[]): Map<string, number> {
  const sorted = [...rows].sort((left, right) => {
    const byDate = (left['date'] ?? '').localeCompare(right['date'] ?? '');
    return byDate !== 0
      ? byDate
      : (left['gid'] ?? '').localeCompare(right['gid'] ?? '');
  });

  const numbers = new Map<string, number>();
  let next = 1;
  for (const row of sorted) {
    const gid = row['gid'];
    if (!numbers.has(gid)) {
      numbers.set(gid, next);
      next += 1;
    }
  }
  return numbers;
}
