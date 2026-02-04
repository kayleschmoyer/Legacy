import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create is_major_league function
 *
 * Creates a helper function to identify major league stats.
 * This function checks if a league ID contains any major league designations.
 *
 * Major leagues include:
 * - AL (American League)
 * - NL (National League)
 * - Historical leagues: NN2, NAL, NNL, ECL, FL, EWL, NSL, PL, UA
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Creating is_major_league function...');

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.is_major_league(lg_id text) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
      SELECT cardinality(ARRAY(
        SELECT UNNEST(string_to_array(lg_id, ','))
        INTERSECT
        SELECT UNNEST(ARRAY['AL', 'NL', 'NN2', 'NAL', 'NNL', 'ECL', 'FL', 'EWL', 'NSL', 'PL', 'UA'])
      )) > 0
    $$
  `);

  console.log('✅ is_major_league function created successfully');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Dropping is_major_league function...');

  await db.execute(sql`DROP FUNCTION IF EXISTS public.is_major_league(text)`);

  console.log('✅ is_major_league function dropped successfully');
};
