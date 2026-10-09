import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  PublicDb,
  PublicSchema,
  refreshFootballPlayerEligiblePositions,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import {
  type NflverseRow,
  parseNflverseCsv,
} from '@legacy-sports/data-loaders';
import { type IdpPosition, mapPfrPosition } from '@legacy-sports/pfr-client';
import { InvalidArgumentError } from 'commander';
import { and, eq, sql } from 'drizzle-orm';
import {
  currentNflSeason,
  fetchWeeklyStatsCsv,
  FIRST_SEASON,
} from './ingestNflverseFootball';
import { KNOWN_FOOTBALL_HOF_PLAYERS } from './checkFootballHofCoverage';
import { toError } from '../utils/errors';

/**
 * Seeds football players that PFR discovery never inserted (LS-10585, slice 1
 * of LS-9971) from nflverse's `players.csv`, without any PFR request.
 *
 * LS-9968's HOF "+" parsing bug silently dropped every Hall of Fame player
 * from `queue-players --sport football`, and that command cannot be re-run:
 * PFR is Cloudflare-walled and its terms forbid a derived database (LS-9908,
 * ADR 0022). nflverse's players.csv (CC-BY 4.0, already the pfr_id -> gsis_id
 * crosswalk for `ingest-nflverse-football`) publishes PFR's own ids for every
 * player active from 1974 on, which covers the whole missing HOF cohort except
 * players whose careers ended before 1974 (LS-10588).
 *
 * Identity rules (ADR 0023):
 * - pfr_id is taken verbatim from players.csv — never synthesised from PFR's
 *   `LastFi00` pattern.
 * - Insert-only: `ON CONFLICT (pfr_id) DO NOTHING`. Rows PFR discovery already
 *   created are never touched.
 *
 * Eligibility mirrors what PFR's per-letter index (the old discovery source)
 * lists — players who appeared in a game at a position we track:
 * - position maps through `mapPfrPosition` (QB/RB/WR/TE/K/DL/LB/DB), and
 * - the career began before 1999 (pre-nflverse-stats era; players.csv only
 *   carries those players because they played), OR the player has at least
 *   one nflverse weekly stat row from 1999 on. Practice-squad and
 *   roster-only players have no weekly row and are not seeded.
 *
 * Data source and attribution: nflverse-data, CC-BY 4.0
 * (https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md).
 */

const PLAYERS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const FETCH_TIMEOUT_MS = 120_000;

// nflverse position codes that PFR's index spells differently. Everything
// else (QB, RB, FB, WR, TE, K, DE, DT, NT, LB, ILB, OLB, MLB, CB, S, FS, SS,
// DB) is already a POSITION_MAP key in pfr-client.
const NFLVERSE_POSITION_ALIASES: Record<string, string> = {
  SAF: 'S',
  DL: 'DT',
};

// nflverse `latest_team` codes that differ from nfl_teams.abbreviation. Any
// code not in `validTeams` after aliasing (relocated/defunct franchises —
// OAK, SD, STL, ...) becomes null, matching queue-players' PFR_TEAM_MAP.
const NFLVERSE_TEAM_ALIASES: Record<string, string> = {
  LA: 'LAR',
};

export type SeedSkipReason =
  | 'already_present'
  | 'no_pfr_id'
  | 'untracked_position'
  | 'no_game_activity';

export interface SeedCandidate {
  pfrId: string;
  gsisId: string | null;
  firstName: string;
  lastName: string;
  position: Exclude<IdpPosition, null>;
  nflTeam: string | null;
  /** First season per players.csv (rookie_season, else draft_year). nflverse
   * floors rookie_season at 1974 for older players, so this is an eligibility
   * signal, not a true career start. */
  firstSeason: number | null;
}

export interface SeedSelection {
  candidates: SeedCandidate[];
  skipped: Record<SeedSkipReason, number>;
}

export function mapNflversePosition(raw: string): IdpPosition {
  const upper = raw.trim().toUpperCase();
  return mapPfrPosition(NFLVERSE_POSITION_ALIASES[upper] ?? upper);
}

export function mapNflverseTeam(
  raw: string | undefined,
  validTeams: ReadonlySet<string>,
): string | null {
  const code = raw?.trim().toUpperCase();
  if (!code) return null;
  const mapped = NFLVERSE_TEAM_ALIASES[code] ?? code;
  return validTeams.has(mapped) ? mapped : null;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * First/last name from players.csv's display_name — the name the player is
 * known and searched by ("Joe Montana", "Warren Moon"), matching the PFR
 * index names every other football row carries. players.csv's first_name is
 * the legal given name ("Joseph", "Harold"), so it is only a fallback when
 * display_name is empty (LS-9968).
 *
 * The first name is display_name minus a trailing last_name when the two
 * agree; otherwise display_name is split on its first space (the rule
 * queue-players used for PFR's index names, e.g. "Beckham Jr.").
 */
export function nflverseName(row: NflverseRow): {
  firstName: string;
  lastName: string;
} {
  const first = row.first_name?.trim();
  const last = row.last_name?.trim();
  const display = (row.display_name ?? '').trim();

  if (!display) {
    return { firstName: first ?? '', lastName: last ?? first ?? '' };
  }
  if (last && display.endsWith(` ${last}`)) {
    return {
      firstName: display.slice(0, -(last.length + 1)).trim(),
      lastName: last,
    };
  }
  const spaceIdx = display.indexOf(' ');
  if (spaceIdx === -1) return { firstName: display, lastName: display };
  return {
    firstName: display.slice(0, spaceIdx),
    lastName: display.slice(spaceIdx + 1),
  };
}

export interface NameRepair {
  pfrId: string;
  from: { firstName: string; lastName: string };
  to: { firstName: string; lastName: string };
}

/**
 * Rows an earlier run of this command inserted with players.csv's legal
 * first_name/last_name ("Joseph Montana") instead of the display name
 * (LS-9968). A row is repaired only when its current name is exactly that
 * legal name and differs from nflverseName's, so anything renamed since is
 * left alone. `existingNames` maps football pfr_id to the row's current name
 * and must hold only rows this command inserted — PFR-discovered rows can
 * legitimately carry the legal name.
 */
export function selectNameRepairs(
  playersCsvRows: readonly NflverseRow[],
  existingNames: ReadonlyMap<string, { firstName: string; lastName: string }>,
): NameRepair[] {
  const repairs: NameRepair[] = [];
  for (const row of playersCsvRows) {
    const pfrId = row.pfr_id?.trim();
    const current = pfrId ? existingNames.get(pfrId) : undefined;
    if (!pfrId || !current) continue;

    const legalFirst = row.first_name?.trim();
    const legalLast = row.last_name?.trim();
    if (current.firstName !== legalFirst || current.lastName !== legalLast) {
      continue;
    }
    const to = nflverseName(row);
    if (
      to.firstName === current.firstName &&
      to.lastName === current.lastName
    ) {
      continue;
    }
    repairs.push({ pfrId, from: current, to });
  }
  return repairs;
}

/**
 * Pure selection: which players.csv rows to seed. No I/O, so it is unit
 * tested directly. `existingPfrIds` must be every football pfr_id already in
 * `players`; `activeGsisIds` every gsis id with an nflverse weekly stat row.
 */
export function selectSeedCandidates(
  playersCsvRows: readonly NflverseRow[],
  existingPfrIds: ReadonlySet<string>,
  activeGsisIds: ReadonlySet<string>,
  validTeams: ReadonlySet<string>,
): SeedSelection {
  const skipped: Record<SeedSkipReason, number> = {
    already_present: 0,
    no_pfr_id: 0,
    untracked_position: 0,
    no_game_activity: 0,
  };
  const candidates: SeedCandidate[] = [];
  const seen = new Set<string>();

  for (const row of playersCsvRows) {
    const pfrId = row.pfr_id?.trim();
    if (!pfrId) {
      skipped.no_pfr_id++;
      continue;
    }
    if (existingPfrIds.has(pfrId) || seen.has(pfrId)) {
      skipped.already_present++;
      continue;
    }

    const position = mapNflversePosition(row.position ?? '');
    if (!position) {
      skipped.untracked_position++;
      continue;
    }

    const gsisId = row.gsis_id?.trim() || null;
    const firstSeason =
      parseYear(row.rookie_season) ?? parseYear(row.draft_year);
    const preStatsEra = firstSeason !== null && firstSeason < FIRST_SEASON;
    const hasActivity = gsisId !== null && activeGsisIds.has(gsisId);
    if (!preStatsEra && !hasActivity) {
      skipped.no_game_activity++;
      continue;
    }

    seen.add(pfrId);
    candidates.push({
      pfrId,
      gsisId,
      ...nflverseName(row),
      position,
      nflTeam: mapNflverseTeam(row.latest_team, validTeams),
      firstSeason,
    });
  }

  return { candidates, skipped };
}

/** Every gsis id (`player_id`) with at least one row in a weekly stats CSV.
 * nflverse only writes a weekly row for a player who recorded a stat. */
export function collectActiveGsisIds(
  weeklyCsv: string,
  into: Set<string> = new Set(),
): Set<string> {
  for (const row of parseNflverseCsv(weeklyCsv)) {
    if (row.player_id) into.add(row.player_id);
  }
  return into;
}

/** Known HOF players (check-football-hof-coverage) with a pinned pfr_id that
 * would still be absent after this seed — surfaced in the dry-run report so
 * an operator can see the seed closes the LS-9968 gap before applying it. */
export function knownPlayersStillMissing(
  existingPfrIds: ReadonlySet<string>,
  candidates: readonly SeedCandidate[],
): string[] {
  const seeded = new Set(candidates.map((c) => c.pfrId));
  return KNOWN_FOOTBALL_HOF_PLAYERS.filter(
    (p) => p.pfrId && !existingPfrIds.has(p.pfrId) && !seeded.has(p.pfrId),
  ).map((p) => `${p.lastName} (${p.pfrId})`);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.text();
}

async function fetchActiveGsisIds(): Promise<Set<string>> {
  const active = new Set<string>();
  const lastSeason = currentNflSeason(new Date());
  for (let season = FIRST_SEASON; season <= lastSeason; season++) {
    const csv = await fetchWeeklyStatsCsv(season);
    if (csv === null) {
      // Only the in-progress season can legitimately 404 (LS-10223); any
      // other missing season would under-seed, so fail rather than guess.
      if (season === lastSeason) {
        LOGGER.warn(`nflverse weekly stats for ${season} not posted yet`);
        continue;
      }
      throw new Error(`nflverse weekly stats for ${season} returned 404`);
    }
    collectActiveGsisIds(csv, active);
    LOGGER.info(`Season ${season}: ${active.size} active players so far`);
  }
  return active;
}

async function loadExistingPfrIds(db: PublicDb): Promise<Set<string>> {
  const rows = await db
    .select({ pfrId: PublicSchema.players.pfrId })
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));
  return new Set(rows.flatMap((r) => (r.pfrId ? [r.pfrId] : [])));
}

async function loadValidTeams(db: PublicDb): Promise<Set<string>> {
  const rows = await db
    .select({ abbreviation: PublicSchema.nflTeams.abbreviation })
    .from(PublicSchema.nflTeams);
  return new Set(rows.map((r) => r.abbreviation));
}

async function insertCandidate(
  db: PublicDb,
  c: SeedCandidate,
): Promise<boolean> {
  // bref_id is NOT NULL; football rows use pfr_id as bref_id (same as
  // queue-players' upsertFootballPlayer). DO NOTHING, not DO UPDATE: this
  // command only ever adds rows PFR discovery missed.
  const result = await db.execute(sql`
    INSERT INTO public.players
      (first_name, last_name, bref_id, pfr_id, sport, is_dst, nfl_team, position)
    VALUES
      (${c.firstName}, ${c.lastName}, ${c.pfrId}, ${c.pfrId}, 'football', false, ${c.nflTeam}, ${c.position})
    ON CONFLICT DO NOTHING
  `);
  return (result.rowCount ?? 0) > 0;
}

async function loadNamesCreatedSince(
  db: PublicDb,
  since: Date,
): Promise<Map<string, { firstName: string; lastName: string }>> {
  const rows = await db
    .select({
      pfrId: PublicSchema.players.pfrId,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
    })
    .from(PublicSchema.players)
    .where(
      and(
        eq(PublicSchema.players.sport, 'football'),
        // created_at is not mapped on the Drizzle players model.
        sql`${PublicSchema.players}.created_at >= ${since.toISOString()}`,
      ),
    );
  return new Map(
    rows.flatMap((r) =>
      r.pfrId
        ? [[r.pfrId, { firstName: r.firstName, lastName: r.lastName }]]
        : [],
    ),
  );
}

async function repairNames(
  db: PublicDb,
  playersCsv: readonly NflverseRow[],
  since: Date,
  dryRun: boolean,
): Promise<void> {
  // Bounded by created_at: PFR-discovered rows can legitimately carry a name
  // that equals players.csv's legal one ("Derrick Alexander"), and must not
  // be renamed. Only rows this command inserted are candidates.
  const repairs = selectNameRepairs(
    playersCsv,
    await loadNamesCreatedSince(db, since),
  );
  LOGGER.info(
    `Name repair: ${repairs.length} row(s) carry players.csv's legal name instead of the display name. ` +
      `Sample: ${repairs
        .slice(0, 25)
        .map(
          (r) =>
            `${r.from.firstName} ${r.from.lastName} -> ${r.to.firstName} ${r.to.lastName} (${r.pfrId})`,
        )
        .join('; ')}`,
  );
  if (dryRun) {
    LOGGER.info(
      `[dry-run] would rename ${repairs.length} player(s); pass --apply to write`,
    );
    return;
  }

  let renamed = 0;
  for (const r of repairs) {
    // Re-check the old name in the WHERE so a row renamed since the read
    // is left alone.
    const result = await db.execute(sql`
      UPDATE public.players
      SET first_name = ${r.to.firstName}, last_name = ${r.to.lastName}
      WHERE sport = 'football' AND pfr_id = ${r.pfrId}
        AND first_name = ${r.from.firstName} AND last_name = ${r.from.lastName}
    `);
    renamed += result.rowCount ?? 0;
  }
  LOGGER.info(`Renamed ${renamed} player(s)`);
}

/** Commander parser for `--repair-names-since`: an ISO-8601 timestamp. */
export function parseIsoDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidArgumentError(`Not an ISO-8601 timestamp: '${value}'`);
  }
  return date;
}

export interface SeedFootballPlayersArgs {
  dryRun?: boolean;
  /** Instead of seeding, fix names an earlier run (rows created at or after
   * this time) wrote from players.csv's legal first_name (LS-9968). */
  repairNamesSince?: Date;
}

export async function handleSeedFootballPlayers(
  args: SeedFootballPlayersArgs,
): Promise<void> {
  const dryRun = args.dryRun ?? true;
  LOGGER.info(
    `seed-football-players: nflverse players.csv -> players (dryRun=${dryRun}` +
      `${args.repairNamesSince ? `, repairNamesSince=${args.repairNamesSince.toISOString()}` : ''}). ` +
      'Data source: nflverse-data (CC-BY 4.0, https://github.com/nflverse/nflverse-data)',
  );

  const playersCsv = parseNflverseCsv(await fetchText(PLAYERS_URL));
  LOGGER.info(`players.csv: ${playersCsv.length} rows`);

  const since = args.repairNamesSince;
  if (since) {
    await runWithPublicClient(getDbOptions(), (db: PublicDb) =>
      repairNames(db, playersCsv, since, dryRun),
    );
    return;
  }

  const activeGsisIds = await fetchActiveGsisIds();

  await runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
    const [existingPfrIds, validTeams] = await Promise.all([
      loadExistingPfrIds(db),
      loadValidTeams(db),
    ]);

    const { candidates, skipped } = selectSeedCandidates(
      playersCsv,
      existingPfrIds,
      activeGsisIds,
      validTeams,
    );

    const byPosition: Record<string, number> = {};
    for (const c of candidates) {
      byPosition[c.position] = (byPosition[c.position] ?? 0) + 1;
    }
    const preStatsEra = candidates.filter(
      (c) => c.firstSeason !== null && c.firstSeason < FIRST_SEASON,
    ).length;

    LOGGER.info(
      `Selected ${candidates.length} player(s) to seed ` +
        `(${preStatsEra} with careers starting before ${FIRST_SEASON}); ` +
        `by position ${JSON.stringify(byPosition)}; skipped ${JSON.stringify(skipped)}`,
    );
    LOGGER.info(
      `Sample: ${candidates
        .slice(0, 25)
        .map((c) => `${c.firstName} ${c.lastName} (${c.pfrId}, ${c.position})`)
        .join('; ')}`,
    );

    const stillMissing = knownPlayersStillMissing(existingPfrIds, candidates);
    if (stillMissing.length > 0) {
      LOGGER.warn(
        `Known HOF players with a pinned pfr_id that this seed does NOT cover: ${stillMissing.join(', ')}`,
      );
    }

    if (dryRun) {
      LOGGER.info(
        `[dry-run] would insert ${candidates.length} player(s); pass --apply to write`,
      );
      return;
    }

    let inserted = 0;
    for (const candidate of candidates) {
      if (await insertCandidate(db, candidate)) inserted++;
    }
    LOGGER.info(
      `Inserted ${inserted} player(s) (${candidates.length - inserted} already present at insert time)`,
    );

    // players.position feeds the football_player_eligible_positions
    // materialized view (LS-10553). Non-fatal, same as queue-players.
    try {
      await refreshFootballPlayerEligiblePositions(db);
      LOGGER.info('football_player_eligible_positions refreshed.');
    } catch (refreshError) {
      LOGGER.error(
        'Failed to refresh football_player_eligible_positions:',
        toError(refreshError),
      );
    }
  });
}
