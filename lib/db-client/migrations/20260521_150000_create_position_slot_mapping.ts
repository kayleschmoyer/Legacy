import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create position_slot_mapping reference table (LS-4694).
 *
 * Replaces a 31-row inline `VALUES` CTE in the draft auto-pick candidate-pool
 * query. The CTE was emitted on every invocation (~8.5k calls/day) with the
 * same constants every time, costing 60+ bind parameters per call and giving
 * the planner no statistics for join ordering. Promoting the mapping to a
 * real table with a PK + ANALYZE lets the planner pick a good plan once.
 *
 * Mirrors the baseball entries in `ALLOWED_POSITIONS_BY_SPORT.baseball`
 * (see lib/utils/src/lib/allowed-positions.ts). Keep this seed in sync if
 * baseball slot eligibility changes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."position_slot_mapping" (
      "slot_type" text NOT NULL,
      "stat_pos" text NOT NULL,
      CONSTRAINT "position_slot_mapping_pk" PRIMARY KEY ("slot_type", "stat_pos")
    );
  `);

  await db.execute(`
    INSERT INTO "public"."position_slot_mapping" ("slot_type", "stat_pos")
    VALUES
      ('1B', '1B'),
      ('2B', '2B'),
      ('3B', '3B'),
      ('C',  'C'),
      ('CF', 'CF'),
      ('LF', 'LF'),
      ('RF', 'RF'),
      ('SS', 'SS'),
      ('SP', 'SP'),
      ('SP', 'P'),
      ('RP', 'RP'),
      ('RP', 'P'),
      ('OF', 'LF'),
      ('OF', 'RF'),
      ('OF', 'CF'),
      ('OF', 'OF'),
      ('IF', '1B'),
      ('IF', '2B'),
      ('IF', '3B'),
      ('IF', 'SS'),
      ('DH', '1B'),
      ('DH', '2B'),
      ('DH', '3B'),
      ('DH', 'SS'),
      ('DH', 'LF'),
      ('DH', 'RF'),
      ('DH', 'CF'),
      ('DH', 'OF'),
      ('DH', 'C'),
      ('DH', 'DH'),
      ('XDH', 'DH')
    ON CONFLICT ("slot_type", "stat_pos") DO NOTHING;
  `);

  await db.execute(`ANALYZE "public"."position_slot_mapping";`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."position_slot_mapping";`);
};
