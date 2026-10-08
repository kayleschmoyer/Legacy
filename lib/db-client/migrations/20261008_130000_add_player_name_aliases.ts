import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

/**
 * Known-name / legal-name corrections for well-known MLB players (LS-10669).
 *
 * Product decision on LS-10669: players are displayed under their known
 * Baseball-Reference name ("Hank Aaron"), and their legal names ("Henry
 * Aaron") are searchable aliases. Keyed by bref_id so the backfill is a
 * no-op on any environment that lacks a row.
 *
 * `knownFirstName` is set only where the stored first_name is the legal name
 * instead of the B-Ref known name (`legalFirstName`); every other row already
 * stores the known name and only gains an alias.
 *
 * Multiple aliases are joined with `|` (never typed in a search term) so a
 * search can't match across the boundary between two aliases.
 */
const PLAYER_NAME_CORRECTIONS: ReadonlyArray<{
  brefId: string;
  aliases: readonly string[];
  knownFirstName?: string;
  legalFirstName?: string;
}> = [
  {
    brefId: 'aaronha01',
    aliases: ['Henry Aaron'],
    knownFirstName: 'Hank',
    legalFirstName: 'Henry',
  },
  { brefId: 'ruthba01', aliases: ['George Ruth'] },
  { brefId: 'bankser01', aliases: ['Ernest Banks'] },
  { brefId: 'berrayo01', aliases: ['Lawrence Berra'] },
  { brefId: 'carewro01', aliases: ['Rodney Carew'] },
  { brefId: 'cobbty01', aliases: ['Tyrus Cobb'] },
  { brefId: 'deandi01', aliases: ['Jay Dean'] },
  { brefId: 'dimagjo01', aliases: ['Joseph DiMaggio'] },
  { brefId: 'drysddo01', aliases: ['Donald Drysdale'] },
  { brefId: 'fellebo01', aliases: ['Robert Feller'] },
  { brefId: 'fordwh01', aliases: ['Edward Ford'] },
  { brefId: 'foxxji01', aliases: ['James Foxx'] },
  { brefId: 'gehrilo01', aliases: ['Henry Gehrig'] },
  { brefId: 'glavito02', aliases: ['Thomas Glavine'] },
  { brefId: 'greenha01', aliases: ['Henry Greenberg'] },
  { brefId: 'griffke01', aliases: ['George Griffey'] },
  { brefId: 'griffke02', aliases: ['George Griffey Jr.'] },
  { brefId: 'grovele01', aliases: ['Robert Grove'] },
  { brefId: 'gwynnto01', aliases: ['Anthony Gwynn'] },
  { brefId: 'jacksbo01', aliases: ['Vincent Jackson'] },
  {
    brefId: 'jacksjo01',
    aliases: ['Joseph Jackson', 'Shoeless Joe Jackson'],
  },
  { brefId: 'jacksre01', aliases: ['Reginald Jackson'] },
  { brefId: 'johnsra05', aliases: ['Randall Johnson'] },
  { brefId: 'jonesch06', aliases: ['Larry Jones'] },
  { brefId: 'kalinal01', aliases: ['Albert Kaline'] },
  { brefId: 'koufasa01', aliases: ['Sanford Koufax'] },
  { brefId: 'lajoina01', aliases: ['Napoleon Lajoie'] },
  { brefId: 'maddugr01', aliases: ['Gregory Maddux'] },
  { brefId: 'mathech01', aliases: ['Christopher Mathewson'] },
  { brefId: 'musiast01', aliases: ['Stanley Musial'] },
  { brefId: 'ottme01', aliases: ['Melvin Ott'] },
  { brefId: 'paigesa01', aliases: ['Leroy Paige'] },
  { brefId: 'piazzmi01', aliases: ['Michael Piazza'] },
  { brefId: 'ramirma02', aliases: ['Manuel Ramírez'] },
  { brefId: 'reesepe01', aliases: ['Harold Reese'] },
  { brefId: 'ripkeca01', aliases: ['Calvin Ripken Jr.'] },
  { brefId: 'robinja02', aliases: ['Jack Robinson'] },
  { brefId: 'rodrial01', aliases: ['Alexander Rodriguez'] },
  { brefId: 'rosepe01', aliases: ['Peter Rose'] },
  { brefId: 'ryanno01', aliases: ['Lynn Ryan'] },
  { brefId: 'sabatc.01', aliases: ['Carsten Sabathia'] },
  { brefId: 'schmimi01', aliases: ['Michael Schmidt'] },
  { brefId: 'seaveto01', aliases: ['George Seaver'] },
  { brefId: 'smithoz01', aliases: ['Osborne Smith'] },
  { brefId: 'snidedu01', aliases: ['Edwin Snider'] },
  { brefId: 'sosasa01', aliases: ['Samuel Sosa'] },
  { brefId: 'wagneho01', aliases: ['Johannes Wagner'] },
  { brefId: 'willite01', aliases: ['Theodore Williams'] },
  { brefId: 'winfida01', aliases: ['David Winfield'] },
  { brefId: 'youngcy01', aliases: ['Denton Young'] },
];

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Migration: searchable name aliases for MLB players (LS-10669).
 *
 * Adds nullable `players.name_aliases` (`|`-joined full-name aliases), then
 * backfills it from {@link PLAYER_NAME_CORRECTIONS}: "Hank Aaron" was stored
 * under his legal first name (id 2, "Henry"), unlike every other famous
 * player (e.g. "Babe Ruth"), so his first_name is corrected to the known
 * name and the legal names of well-known players become aliases. Searching
 * either name now finds the player.
 *
 * buildPlayerNameSearch (lib/db-client/src/lib/query-builders/
 * TypeSafeQueryBuilder.ts) ORs `lower(public.f_unaccent(name_aliases))
 * ILIKE ...` onto the LS-10728 full-name arm. idx_players_name_aliases_trgm
 * uses that exact expression, so both OR arms are indexable and the planner
 * can keep a BitmapOr instead of a sequential scan.
 *
 * Idempotent: the column and index use IF NOT EXISTS, the backfill only
 * touches rows whose value differs, the first-name fix is guarded on the
 * legal name still being stored, and an INVALID leftover from an interrupted
 * CONCURRENTLY build is dropped before the create. The migration runner
 * executes each statement in autocommit, so CONCURRENTLY is allowed.
 */
export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await db.execute(
    `ALTER TABLE public.players ADD COLUMN IF NOT EXISTS name_aliases text`,
  );

  const aliasRows = PLAYER_NAME_CORRECTIONS.map(
    (c) => `(${sqlLiteral(c.brefId)}, ${sqlLiteral(c.aliases.join('|'))})`,
  ).join(',\n      ');
  await db.execute(`
    UPDATE public.players p
       SET name_aliases = v.aliases
      FROM (VALUES
      ${aliasRows}
      ) AS v(bref_id, aliases)
     WHERE p.bref_id = v.bref_id
       AND p.sport = 'baseball'
       AND p.name_aliases IS DISTINCT FROM v.aliases
  `);

  for (const c of PLAYER_NAME_CORRECTIONS) {
    if (!c.knownFirstName || !c.legalFirstName) continue;
    await db.execute(`
      UPDATE public.players
         SET first_name = ${sqlLiteral(c.knownFirstName)}
       WHERE bref_id = ${sqlLiteral(c.brefId)}
         AND sport = 'baseball'
         AND first_name = ${sqlLiteral(c.legalFirstName)}
    `);
  }

  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('public.idx_players_name_aliases_trgm')
          AND NOT indisvalid
      ) THEN
        DROP INDEX public.idx_players_name_aliases_trgm;
      END IF;
    END
    $$
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_name_aliases_trgm
      ON public.players
      USING gin ((lower(public.f_unaccent(name_aliases))) gin_trgm_ops)
  `);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(
    `DROP INDEX CONCURRENTLY IF EXISTS public.idx_players_name_aliases_trgm`,
  );
  for (const c of PLAYER_NAME_CORRECTIONS) {
    if (!c.knownFirstName || !c.legalFirstName) continue;
    await db.execute(`
      UPDATE public.players
         SET first_name = ${sqlLiteral(c.legalFirstName)}
       WHERE bref_id = ${sqlLiteral(c.brefId)}
         AND sport = 'baseball'
         AND first_name = ${sqlLiteral(c.knownFirstName)}
    `);
  }
  await db.execute(
    `ALTER TABLE public.players DROP COLUMN IF EXISTS name_aliases`,
  );
};
