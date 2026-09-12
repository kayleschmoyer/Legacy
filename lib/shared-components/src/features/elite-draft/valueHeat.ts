import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import type { DraftPickRecord, DraftPlayer } from './types';
import type { SportKind } from '../../config/sports';

/**
 * Value-heat board arithmetic (LS-10096).
 *
 * A pick's *value* is how far the player fell to it: the overall pick number
 * minus the player's consensus rank. Draft the consensus #1 at pick 5 and the
 * value is +4 — a steal. Draft the consensus #30 at pick 5 and it is −25 — a
 * reach. The board tints each cell by that number and totals it per team.
 *
 * Everything here is pure and null-safe on purpose: the rank (`adp`) is
 * nullable and, until historical ADP data is actually collected, *frequently*
 * null. An unknown rank is not a zero. A zero would render as a cell drafted
 * exactly on consensus and would drag a team's total toward the middle; the
 * honest answer is to say nothing — an em dash, no tint, and no contribution
 * to the total.
 */

/** Em dash shown wherever a pick has no consensus rank on file. */
export const NO_VALUE = '—';

/**
 * A pick's value, or null when the player has no consensus rank.
 *
 * Note the asymmetry with `overallPick`, which is always present: it is only
 * ever the rank that can be missing.
 */
export function pickValue(
  pick: Pick<DraftPickRecord, 'overallPick' | 'adp'>,
): number | null {
  const { adp, overallPick } = pick;
  if (adp == null || !Number.isFinite(adp)) return null;
  if (overallPick == null || !Number.isFinite(overallPick)) return null;
  return overallPick - adp;
}

/**
 * Tint band for a value. The thresholds are 6 and 14 in both directions, and
 * they are the numbers the legend quotes — the option-C prototype's legend
 * claimed "8+", which was wrong about its own code (LS-10096).
 *
 * Band 0 covers both "drafted near consensus" and "rank unknown": neither
 * earns a tint. The two are never confusable on screen, because the unknown
 * case also shows an em dash instead of a number.
 */
export type TintBand = -3 | -2 | 0 | 2 | 3;

export const TINT_THRESHOLD_STRONG = 14;
export const TINT_THRESHOLD_LIGHT = 6;

export function tintBand(value: number | null): TintBand {
  if (value == null) return 0;
  if (value >= TINT_THRESHOLD_STRONG) return 3;
  if (value >= TINT_THRESHOLD_LIGHT) return 2;
  if (value <= -TINT_THRESHOLD_STRONG) return -3;
  if (value <= -TINT_THRESHOLD_LIGHT) return -2;
  return 0;
}

/**
 * The signed delta as displayed: `+4`, `-25`, `0`, or the em dash when the
 * rank is unknown.
 *
 * This string is the reason the board stays readable without color. Tint is a
 * second channel for the same fact, never the only one, so a colorblind
 * manager — or anyone at the low tint alphas — reads the same board.
 */
export function formatDelta(value: number | null): string {
  if (value == null) return NO_VALUE;
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Sum of a team's pick values. Picks with no consensus rank are skipped, not
 * counted as zero.
 *
 * Returns 0 for a team whose picks are all unranked, which is the same number
 * a genuinely break-even team shows. That collision is deliberate and
 * harmless: both mean "no net value to claim", and the cells above the total
 * say which is which.
 */
export function teamNetValue(
  picks: ReadonlyArray<Pick<DraftPickRecord, 'overallPick' | 'adp'>>,
): number {
  let total = 0;
  for (const pick of picks) {
    const value = pickValue(pick);
    if (value != null) total += value;
  }
  return total;
}

/** Signed total as displayed: `+18`, `-7`, `0`. Never an em dash — a team's
 *  total is always a real sum, even when every pick in it was unranked. */
export function formatNetValue(total: number): string {
  return total > 0 ? `+${total}` : String(total);
}

/** Team initials for the footer's per-team label ("Sandlot Dreamers" → "SD"). */
export function teamInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4);
}

/**
 * Per-position preference order for the cell's one signature stat, by label.
 * A position not listed here (or a player missing every preferred stat) falls
 * back to the first stat column that has a real value.
 */
const SIGNATURE_STAT_PREFERENCE: Record<string, readonly string[]> = {
  // Baseball. Pitchers are handled before this table is consulted — see
  // signatureStat() — because ERA and K aren't stat-table columns.
  C: ['HR', 'AVG'],
  '1B': ['HR', 'AVG'],
  '2B': ['AVG', 'HR'],
  '3B': ['HR', 'AVG'],
  SS: ['AVG', 'HR'],
  OF: ['HR', 'AVG'],
  DH: ['HR', 'AVG'],
  // Football
  QB: ['PASS YDS', 'TD'],
  RB: ['RUSH YDS', 'TD'],
  WR: ['REC', 'TD'],
  TE: ['REC', 'TD'],
  K: ['FG'],
};

export interface SignatureStat {
  label: string;
  value: string;
}

/**
 * The single stat the cell has room for, chosen by position so a pitcher's
 * cell doesn't lead with home runs.
 *
 * Returns null when nothing is on file rather than an em dash, so the caller
 * can omit the element entirely instead of rendering a dangling label — the
 * cell already carries one em dash for an unknown rank and a second would
 * read as a broken row.
 */
export function signatureStat(
  player: DraftPlayer | undefined,
  sport: SportKind,
): SignatureStat | null {
  if (!player) return null;

  // A pitcher's signature stat is ERA (then strikeouts, then wins), none of
  // which the shared stat table carries — its columns are the board's hitter
  // columns. Read them off the player instead of letting a pitcher's cell
  // lead with home runs. Guarded on isPitcher rather than position so a
  // reliever typed 'RP' and one typed 'P' behave alike.
  if (sport === 'baseball' && player.isPitcher) {
    if (player.era != null)
      return { label: 'ERA', value: player.era.toFixed(2) };
    if (player.strikeouts != null)
      return { label: 'K', value: String(player.strikeouts) };
    if (player.wins != null) return { label: 'W', value: String(player.wins) };
  }

  const columns = STAT_COLUMNS_BY_SPORT[sport] ?? [];
  const preferred = SIGNATURE_STAT_PREFERENCE[player.position] ?? [];

  const candidates = [
    ...preferred
      .map((label) => columns.find((column) => column.label === label))
      .filter((column): column is (typeof columns)[number] => column != null),
    ...columns,
  ];

  for (const column of candidates) {
    const value = column.render(player);
    if (value && value !== NO_VALUE) return { label: column.label, value };
  }
  return null;
}
