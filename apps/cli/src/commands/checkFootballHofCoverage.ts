import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { and, eq, ilike, or } from 'drizzle-orm';

/**
 * Regression guard for LS-9968: a curated list of Hall of Fame / all-time
 * top-yardage NFL players who must have a `players` row (sport='football',
 * pfr_id set) once discovery has run. There is no in-database source of
 * ground-truth career yardage to check an arbitrary "N yards" threshold
 * against (that is precisely the gap this ticket describes), so this stands
 * in with a fixed, spot-check roster instead: if PFR/PFA discovery ever
 * regresses to silently dropping a cohort again (as it did for every HOF
 * player behind the "+" marker — see Players.ts), one of these well-known
 * names will disappear and this check will fail.
 *
 * Spans both the 1960-1998 range named in the ticket (Montana, Marino,
 * Elway, Unitas, Namath, Staubach, Tarkenton, Favre, Aikman, Payton, Rice,
 * Simpson) and 1999+ (Manning, Warner) — LS-9968 AC "check the 1999+ range
 * too" found the same defect there (neither is era-bound; the bug is in the
 * shared per-letter discovery path used for every season).
 */
export const KNOWN_FOOTBALL_HOF_LAST_NAMES: readonly string[] = [
  'Montana',
  'Marino',
  'Elway',
  'Unitas',
  'Namath',
  'Staubach',
  'Tarkenton',
  'Favre',
  'Aikman',
  'Payton',
  'Rice',
  'Simpson',
  'Manning',
  'Warner',
];

export interface FootballPlayerRow {
  lastName: string;
  pfrId: string | null;
}

/**
 * Pure comparison: given the football players currently in the DB, return
 * the subset of KNOWN_FOOTBALL_HOF_LAST_NAMES with no matching row that
 * carries a pfr_id (a name match with a null pfr_id is not "present" for
 * this purpose — it would not be reachable by the stats loader either).
 */
export function findMissingKnownPlayers(
  dbRows: FootballPlayerRow[],
  knownLastNames: readonly string[] = KNOWN_FOOTBALL_HOF_LAST_NAMES,
): string[] {
  const presentLastNames = new Set(
    dbRows.filter((r) => r.pfrId !== null).map((r) => r.lastName.toLowerCase()),
  );

  return knownLastNames.filter(
    (name) => !presentLastNames.has(name.toLowerCase()),
  );
}

async function fetchFootballPlayersByLastName(
  db: PublicDb,
  lastNames: readonly string[],
): Promise<FootballPlayerRow[]> {
  if (lastNames.length === 0) return [];

  const rows = await db
    .select({
      lastName: PublicSchema.players.lastName,
      pfrId: PublicSchema.players.pfrId,
    })
    .from(PublicSchema.players)
    .where(
      and(
        eq(PublicSchema.players.sport, 'football'),
        or(
          ...lastNames.map((name) =>
            ilike(PublicSchema.players.lastName, name),
          ),
        ),
      ),
    );

  return rows;
}

export async function handleCheckFootballHofCoverage(): Promise<void> {
  const opts = getDbOptions();

  const missing = await runWithPublicClient(opts, async (db: PublicDb) => {
    const rows = await fetchFootballPlayersByLastName(
      db,
      KNOWN_FOOTBALL_HOF_LAST_NAMES,
    );
    return findMissingKnownPlayers(rows);
  });

  if (missing.length === 0) {
    LOGGER.info(
      `✅ football HOF coverage check passed: all ${KNOWN_FOOTBALL_HOF_LAST_NAMES.length} known players present.`,
    );
    return;
  }

  LOGGER.error(
    `❌ football HOF coverage check FAILED: missing players table rows (with pfr_id) for: ${missing.join(', ')}. ` +
      'This is the LS-9968 regression signal — re-check football-player discovery (lib/pfr-client/src/lib/Players.ts) ' +
      'for a cohort being silently dropped.',
  );
  process.exitCode = 1;
}
