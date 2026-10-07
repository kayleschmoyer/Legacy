import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Canonical on-base percentage (LS-10846).
 *
 *   OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
 *
 * Every component is NULL-safe (a missing value counts as 0 — e.g. SF before it
 * was tracked), and the result is null only when the denominator is 0. SH is
 * not part of OBP.
 *
 * The SQL fragment (`onBasePercentageSql`) and the TS function
 * (`computeOnBasePercentage`) are two renderings of the same formula: the
 * server sorts by the former and the GraphQL resolvers display the latter, so
 * they must stay in lock-step (see on-base-percentage.spec.ts).
 */

export interface OnBasePercentageComponents {
  h?: number | null;
  bb?: number | null;
  hbp?: number | null;
  ab?: number | null;
  /**
   * season_batting.sf is an integer column but the Drizzle model still
   * declares it varchar, so a numeric string is accepted too.
   */
  sf?: number | string | null;
}

export function computeOnBasePercentage(
  stats: OnBasePercentageComponents,
): number | null {
  const h = stats.h ?? 0;
  const bb = stats.bb ?? 0;
  const hbp = stats.hbp ?? 0;
  const ab = stats.ab ?? 0;
  const sf = Number(stats.sf ?? 0) || 0;
  const denominator = ab + bb + hbp + sf;
  if (denominator === 0) return null;
  return (h + bb + hbp) / denominator;
}

export interface OnBasePercentageColumns {
  h: SQLWrapper;
  bb: SQLWrapper;
  hbp: SQLWrapper;
  ab: SQLWrapper;
  sf: SQLWrapper;
}

/** SQL rendering of {@link computeOnBasePercentage}; NULL when the denominator is 0. */
export function onBasePercentageSql(cols: OnBasePercentageColumns): SQL {
  const h = sql`COALESCE(${cols.h}, 0)`;
  const bb = sql`COALESCE(${cols.bb}, 0)`;
  const hbp = sql`COALESCE(${cols.hbp}, 0)`;
  const ab = sql`COALESCE(${cols.ab}, 0)`;
  const sf = sql`COALESCE(${cols.sf}, 0)`;
  return sql`((${h} + ${bb} + ${hbp})::numeric / NULLIF(${ab} + ${bb} + ${hbp} + ${sf}, 0))`;
}
