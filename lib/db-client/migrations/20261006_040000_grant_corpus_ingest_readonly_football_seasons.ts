import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: let corpus_ingest_readonly read the football_season_* tables (LS-10621)
 *
 * The PFA crosswalk (`fetchFootballPlayerCandidates` in
 * lib/pfa-client/src/lib/crosswalk-resolver.ts) reads each football player's
 * min/max season from the six football_season_* tables, not just `players`.
 * 20261005_160000_add_corpus_ingest_readonly_role.ts granted SELECT on
 * `players` only, so the first `source=pfa` Corpus Ingest dry run failed with
 * "Failed query: select player_id, min(season), max(season) from
 * football_season_passing".
 *
 * Still read-only: SELECT on exactly the tables the crosswalk queries.
 */

const TABLES = sql.raw(
  [
    'public.football_season_passing',
    'public.football_season_rushing',
    'public.football_season_receiving',
    'public.football_season_kicking',
    'public.football_season_defense',
    'public.football_season_defense_idp',
  ].join(', '),
);

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔒 Granting corpus_ingest_readonly SELECT on football_season_*...',
  );

  await db.execute(sql`GRANT SELECT ON ${TABLES} TO corpus_ingest_readonly;`);

  console.log('✅ corpus_ingest_readonly can read football_season_*');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔓 Revoking corpus_ingest_readonly SELECT on football_season_*...',
  );

  await db.execute(
    sql`REVOKE SELECT ON ${TABLES} FROM corpus_ingest_readonly;`,
  );

  console.log('✅ corpus_ingest_readonly football_season_* access revoked');
};
