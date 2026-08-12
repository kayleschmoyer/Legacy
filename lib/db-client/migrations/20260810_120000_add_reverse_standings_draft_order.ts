import { type PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: add 'reverse_standings' to the draft_order enum (LS-8929).
 *
 * Keeper leagues can now select a "Reverse Standings" / previous-year-inverse
 * draft order (worst finisher from the prior season picks first) alongside
 * the existing 'snake' and 'linear' orders. No column/table changes — only
 * the enum's allowed values grow.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // ALTER TYPE ... ADD VALUE cannot run inside a transaction; Drizzle runs
  // each db.execute() as its own implicit statement, which satisfies this.
  await db.execute(
    `ALTER TYPE "public"."draft_order" ADD VALUE IF NOT EXISTS 'reverse_standings';`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Postgres cannot drop a single enum value. Best-effort reversal: migrate
  // any drafts using the new value back to 'snake' so the column stays valid
  // if a later migration ever recreates the enum without it. The enum type
  // itself still carries 'reverse_standings' after this runs (same documented
  // limitation as the 20260219 draft_order migration's down()).
  await db.execute(`
    UPDATE drafts SET draft_order = 'snake'::draft_order
    WHERE draft_order::text = 'reverse_standings';
  `);
};
