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
 *
 * Each entry pins the exact `pfr_id` where one is known (LS-9765): a
 * last-name-only check is blind to a specific HOF player still being
 * missing whenever other, unrelated players share that surname. That is
 * exactly how Emmitt Smith and Walter Payton slipped past this guard after
 * LS-9968 landed — "Smith" and "Payton" both already matched plenty of
 * *other* players in the table, so the last-name check reported them
 * "present" while the two individual HOF rows this check was meant to
 * protect stayed absent, and the leaderboard kept surfacing Frank Gore as
 * the career rushing-yards leader. A `pfrId` match checks the individual;
 * entries without one (their PFR id wasn't looked up) fall back to the
 * original last-name check.
 */
export interface KnownFootballHofPlayer {
  lastName: string;
  /** Exact PFR id, when known — required to catch LS-9765-style masking by a
   * shared surname. Omit only when the id hasn't been looked up. */
  pfrId?: string;
}

export const KNOWN_FOOTBALL_HOF_PLAYERS: readonly KnownFootballHofPlayer[] = [
  // pfr_ids below are as published in nflverse players.csv (LS-10585) —
  // pinned so a same-surname namesake (Danieal Manning, Sidney Rice, Chad
  // Simpson, ...) can no longer mask the HOF player being absent.
  { lastName: 'Montana', pfrId: 'MontJo01' }, // Joe Montana
  { lastName: 'Marino', pfrId: 'MariDa00' }, // Dan Marino
  { lastName: 'Elway', pfrId: 'ElwaJo00' }, // John Elway
  // Unitas retired in 1973, before nflverse's players.csv coverage starts, so
  // there is no authoritative pfr_id to pin; his row comes from the PFA index
  // (LS-10588, ADR 0023). Surname-only until then.
  { lastName: 'Unitas' },
  { lastName: 'Namath', pfrId: 'NamaJo00' }, // Joe Namath
  { lastName: 'Staubach', pfrId: 'StauRo00' }, // Roger Staubach
  { lastName: 'Tarkenton', pfrId: 'TarkFr00' }, // Fran Tarkenton
  { lastName: 'Favre', pfrId: 'FavrBr00' }, // Brett Favre
  { lastName: 'Aikman', pfrId: 'AikmTr00' }, // Troy Aikman
  { lastName: 'Payton', pfrId: 'PaytWa00' }, // Walter Payton (LS-9765)
  { lastName: 'Rice', pfrId: 'RiceJe00' }, // Jerry Rice
  { lastName: 'Simpson', pfrId: 'SimpO.00' }, // O.J. Simpson
  { lastName: 'Manning', pfrId: 'MannPe00' }, // Peyton Manning
  { lastName: 'Warner', pfrId: 'WarnKu00' }, // Kurt Warner
  { lastName: 'Smith', pfrId: 'SmitEm00' }, // Emmitt Smith (LS-9765)
];

/** Back-compat: the plain last-name list, derived from the players above. */
export const KNOWN_FOOTBALL_HOF_LAST_NAMES: readonly string[] =
  KNOWN_FOOTBALL_HOF_PLAYERS.map((p) => p.lastName);

export interface FootballPlayerRow {
  lastName: string;
  pfrId: string | null;
}

/**
 * Pure comparison: given the football players currently in the DB, return
 * the display label (`lastName`, or `lastName (pfrId)` when the known entry
 * pins one) for each known player with no matching row. A name match with a
 * null pfr_id is not "present" — it would not be reachable by the stats
 * loader either. When a known entry pins a `pfrId`, presence requires that
 * exact id — a same-surname row is not enough (LS-9765).
 */
export function findMissingKnownPlayers(
  dbRows: FootballPlayerRow[],
  knownPlayers: readonly KnownFootballHofPlayer[] = KNOWN_FOOTBALL_HOF_PLAYERS,
): string[] {
  const rowsWithPfrId = dbRows.filter(
    (r): r is FootballPlayerRow & { pfrId: string } => r.pfrId !== null,
  );
  const presentPfrIds = new Set(
    rowsWithPfrId.map((r) => r.pfrId.toLowerCase()),
  );
  const presentLastNames = new Set(
    rowsWithPfrId.map((r) => r.lastName.toLowerCase()),
  );

  return knownPlayers
    .filter((known) =>
      known.pfrId
        ? !presentPfrIds.has(known.pfrId.toLowerCase())
        : !presentLastNames.has(known.lastName.toLowerCase()),
    )
    .map((known) =>
      known.pfrId ? `${known.lastName} (${known.pfrId})` : known.lastName,
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
    return findMissingKnownPlayers(rows, KNOWN_FOOTBALL_HOF_PLAYERS);
  });

  if (missing.length === 0) {
    LOGGER.info(
      `✅ football HOF coverage check passed: all ${KNOWN_FOOTBALL_HOF_PLAYERS.length} known players present.`,
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
