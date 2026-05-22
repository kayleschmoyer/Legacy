import { sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

/**
 * Build a `column = ANY($1::integer[])` predicate.
 *
 * Why: drizzle's `inArray` expands a JS array into `IN ($1, $2, …, $N)`, which
 * bloats the parameter count and prevents Postgres from caching a single
 * normalized plan for large batches (see LS-4696). Sending a single
 * integer-array parameter lets the planner use a hashed-array scan and keeps
 * pg_stat_statements deduplication intact.
 *
 * Use in place of `inArray(col, ids)` for integer-keyed hot paths that batch
 * hundreds-to-thousands of IDs per call (DataLoader fan-out, schedule
 * generation, draft pool building).
 */
export function inArrayAny(column: AnyColumn, ids: readonly number[]): SQL {
  return sql`${column} = ANY(${sql.param([...ids])}::integer[])`;
}
