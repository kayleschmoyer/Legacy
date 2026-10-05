import {
  crawlPlayerIndex,
  createAccumulator,
  fetchFootballPlayerCandidates,
  type PfaCrosswalkRow,
  type PfaIngestAccumulator,
  PfaRateLimiter,
  resolvePfaCrosswalk,
} from '@legacy-sports/pfa-client';
import { PFA_ONLY_KEY_PREFIX } from '@legacy-sports/football-game-stats-provider';
import {
  PublicDb,
  PublicSchema,
  refreshFootballPlayerEligiblePositions,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import {
  crawlSeasonBoxScores,
  FIRST_SEASON,
  LAST_SEASON,
} from './ingestPfaFootball';
import { toError } from '../utils/errors';

/**
 * Seeds football players that have no obtainable pfr_id from the Pro Football
 * Archives player index (LS-10588, slice 4 of LS-9971; ADR 0023's no-pfr_id
 * branch). nflverse players.csv (`seed-football-players`, LS-10585) carries
 * no player whose career ended before 1974 — Johnny Unitas, Bart Starr, Gale
 * Sayers — and PFA ids share nothing with PFR's, so these rows get:
 *
 * - pfr_id NULL. Never synthesised from PFR's `LastFi00` pattern: a guess can
 *   collide with a real player's id and silently attach their data.
 * - pfa_id = the PFA id, bref_id = 'pfa-' || pfa_id (NOT NULL UNIQUE, and
 *   cannot collide with a PFR or BBRef id).
 * - Insert-only (`ON CONFLICT DO NOTHING`): an existing row is never updated.
 *
 * Eligibility: a PFA-index player is seeded only when
 * - the crosswalk (`resolvePfaCrosswalk`) resolves them to NO existing row
 *   (`no_match`). A name match, even an era-mismatched or ambiguous one, is
 *   left alone: that player may already exist under a PFR id.
 * - they have at least one box-score appearance in the crawled seasons (a
 *   passing/rushing/receiving line, or a kick in the scoring plays), and
 * - every appearance is before 1974. Anyone active in 1974 or later is in
 *   nflverse players.csv with an authoritative pfr_id, so a no-match there is
 *   a name-spelling difference, not a missing player.
 *
 * Position: the PFA index carries none, so it is read off the box scores —
 * the category with the most volume (pass attempts -> QB, rush attempts ->
 * RB, receptions -> WR, kicks only -> K). Tight ends are indistinguishable
 * from receivers in a box score and are seeded as WR.
 *
 * Network: requires profootballarchives.com, which is unreachable from cloud
 * agent sessions — this runs from GitHub Actions (the Corpus Ingest
 * workflow's `pfa` source, LS-10587), like `ingest-pfa-football`. Run it
 * before that ingest so the new rows get their pfa-<pfaId> corpus objects.
 */

/** nflverse players.csv floors rookie_season at 1974 (ADR 0023). */
export const NFLVERSE_PLAYERS_FIRST_SEASON = 1974;

export interface PfaUsage {
  passAtt: number;
  rushAtt: number;
  receptions: number;
  /** Named as the kicker of a field goal or extra point in a scoring play. */
  kicked: boolean;
  lastSeason: number;
}

export type PfaSeedPosition = 'QB' | 'RB' | 'WR' | 'K';

export type PfaSeedSkipReason =
  | 'already_present'
  | 'matches_existing_row'
  | 'no_box_score_appearance'
  | 'active_1974_or_later';

export interface PfaSeedCandidate {
  pfaId: string;
  firstName: string;
  lastName: string;
  position: PfaSeedPosition;
  lastSeason: number;
}

export interface PfaSeedSelection {
  candidates: PfaSeedCandidate[];
  skipped: Record<PfaSeedSkipReason, number>;
}

/** bref_id for a PFA-only row; equal to its corpus key (ADR 0023). */
export function pfaBrefId(pfaId: string): string {
  return `${PFA_ONLY_KEY_PREFIX}${pfaId}`;
}

/** First/last name split on the first space — the same rule queue-players
 * and seed-football-players use for a single display name. */
export function splitPfaName(name: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { firstName: trimmed, lastName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1),
  };
}

/** Coarse position from box-score volume. Null when there is no usage. */
export function inferPfaPosition(usage: PfaUsage): PfaSeedPosition | null {
  const { passAtt, rushAtt, receptions } = usage;
  if (passAtt + rushAtt + receptions === 0) return usage.kicked ? 'K' : null;
  if (passAtt >= rushAtt && passAtt >= receptions) return 'QB';
  return rushAtt >= receptions ? 'RB' : 'WR';
}

function usageFor(usage: Map<string, PfaUsage>, pfaId: string): PfaUsage {
  let entry = usage.get(pfaId);
  if (!entry) {
    entry = {
      passAtt: 0,
      rushAtt: 0,
      receptions: 0,
      kicked: false,
      lastSeason: 0,
    };
    usage.set(pfaId, entry);
  }
  return entry;
}

/**
 * Per-player box-score usage from a crawl's accumulator plus the kickers
 * named in each season's scoring plays (`kickersBySeason`). A stat line with
 * null volume still counts as an appearance for `lastSeason`.
 */
export function summarizePfaUsage(
  acc: PfaIngestAccumulator,
  kickersBySeason: ReadonlyMap<number, ReadonlySet<string>>,
): Map<string, PfaUsage> {
  const usage = new Map<string, PfaUsage>();
  const addSeasons = <T>(
    byPfaId: Map<string, Map<number, T[]>>,
    add: (entry: PfaUsage, row: T) => void,
  ) => {
    for (const [pfaId, bySeason] of byPfaId) {
      const entry = usageFor(usage, pfaId);
      for (const [season, rows] of bySeason) {
        entry.lastSeason = Math.max(entry.lastSeason, season);
        for (const row of rows) add(entry, row);
      }
    }
  };
  addSeasons(acc.passing, (e, r) => (e.passAtt += r.att ?? 0));
  addSeasons(acc.rushing, (e, r) => (e.rushAtt += r.att ?? 0));
  addSeasons(acc.receiving, (e, r) => (e.receptions += r.rec ?? 0));
  for (const [season, kickers] of kickersBySeason) {
    for (const pfaId of kickers) {
      const entry = usageFor(usage, pfaId);
      entry.kicked = true;
      entry.lastSeason = Math.max(entry.lastSeason, season);
    }
  }
  return usage;
}

/**
 * Pure selection: which crosswalk rows to seed. `crosswalkRows` come from
 * `resolvePfaCrosswalk` against every existing football row;
 * `existingPfaIds` is every players.pfa_id already set.
 */
export function selectPfaSeedCandidates(
  crosswalkRows: readonly PfaCrosswalkRow[],
  usage: ReadonlyMap<string, PfaUsage>,
  existingPfaIds: ReadonlySet<string>,
): PfaSeedSelection {
  const skipped: Record<PfaSeedSkipReason, number> = {
    already_present: 0,
    matches_existing_row: 0,
    no_box_score_appearance: 0,
    active_1974_or_later: 0,
  };
  const candidates: PfaSeedCandidate[] = [];
  const seen = new Set<string>();

  for (const row of crosswalkRows) {
    // One person can be listed in more than one league's index.
    if (existingPfaIds.has(row.pfaId) || seen.has(row.pfaId)) {
      skipped.already_present++;
      continue;
    }
    if (row.matchMethod !== 'no_match') {
      skipped.matches_existing_row++;
      continue;
    }
    const playerUsage = usage.get(row.pfaId);
    const position = playerUsage ? inferPfaPosition(playerUsage) : null;
    if (!playerUsage || position === null) {
      skipped.no_box_score_appearance++;
      continue;
    }
    if (playerUsage.lastSeason >= NFLVERSE_PLAYERS_FIRST_SEASON) {
      skipped.active_1974_or_later++;
      continue;
    }

    seen.add(row.pfaId);
    candidates.push({
      pfaId: row.pfaId,
      ...splitPfaName(row.pfaName),
      position,
      lastSeason: playerUsage.lastSeason,
    });
  }

  return { candidates, skipped };
}

async function loadExistingPfaIds(db: PublicDb): Promise<Set<string>> {
  const rows = await db
    .select({ pfaId: PublicSchema.players.pfaId })
    .from(PublicSchema.players)
    .where(
      and(
        eq(PublicSchema.players.sport, 'football'),
        isNotNull(PublicSchema.players.pfaId),
      ),
    );
  return new Set(rows.flatMap((r) => (r.pfaId ? [r.pfaId] : [])));
}

async function insertCandidate(
  db: PublicDb,
  c: PfaSeedCandidate,
): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO public.players
      (first_name, last_name, bref_id, pfr_id, pfa_id, sport, is_dst, position)
    VALUES
      (${c.firstName}, ${c.lastName}, ${pfaBrefId(c.pfaId)}, NULL, ${c.pfaId}, 'football', false, ${c.position})
    ON CONFLICT DO NOTHING
  `);
  return (result.rowCount ?? 0) > 0;
}

export interface SeedPfaFootballPlayersArgs {
  dryRun?: boolean;
  from?: number;
  to?: number;
}

export async function handleSeedPfaFootballPlayers(
  args: SeedPfaFootballPlayersArgs,
): Promise<void> {
  const dryRun = args.dryRun ?? true;
  for (const [flag, value] of [
    ['--from', args.from],
    ['--to', args.to],
  ] as const) {
    if (value !== undefined && !Number.isInteger(value)) {
      LOGGER.error(`${flag} must be a whole year (got: ${value})`);
      process.exit(1);
    }
  }
  const from = Math.max(args.from ?? FIRST_SEASON, FIRST_SEASON);
  const to = Math.min(args.to ?? LAST_SEASON, LAST_SEASON);
  if (from > to) {
    LOGGER.error(`Empty season range: ${from} > ${to}`);
    process.exit(1);
  }

  LOGGER.info(
    `seed-pfa-football-players: PFA player index -> players (pfr_id NULL, pfa_id set), ` +
      `box scores ${from}-${to} (dryRun=${dryRun})`,
  );

  const rateLimiter = new PfaRateLimiter();
  const sourceTable = await crawlPlayerIndex({ rateLimiter });
  if (sourceTable.errors.length > 0) {
    // A missing index page would silently under-seed; refuse instead.
    LOGGER.error(
      `PFA player-index crawl had ${sourceTable.errors.length} page error(s) — not seeding from a partial index: ` +
        sourceTable.errors.map((e) => `${e.url} (${e.message})`).join('; '),
    );
    process.exitCode = 1;
    return;
  }

  const acc = createAccumulator();
  const kickersBySeason = new Map<number, Set<string>>();
  for (let season = from; season <= to; season++) {
    const kickers = new Set<string>();
    const { games } = await crawlSeasonBoxScores(
      season,
      rateLimiter,
      acc,
      kickers,
    );
    kickersBySeason.set(season, kickers);
    LOGGER.info(`Season ${season}: ${games} box score(s) parsed`);
  }
  const usage = summarizePfaUsage(acc, kickersBySeason);

  await runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
    const [footballCandidates, existingPfaIds] = await Promise.all([
      fetchFootballPlayerCandidates(db),
      loadExistingPfaIds(db),
    ]);
    const crosswalkRows = resolvePfaCrosswalk(
      sourceTable.entries,
      footballCandidates,
    );
    const { candidates, skipped } = selectPfaSeedCandidates(
      crosswalkRows,
      usage,
      existingPfaIds,
    );

    const byPosition: Record<string, number> = {};
    for (const c of candidates) {
      byPosition[c.position] = (byPosition[c.position] ?? 0) + 1;
    }
    LOGGER.info(
      `Selected ${candidates.length} PFA-only player(s) to seed; ` +
        `by position ${JSON.stringify(byPosition)}; skipped ${JSON.stringify(skipped)}`,
    );
    LOGGER.info(
      `Sample: ${candidates
        .slice(0, 25)
        .map(
          (c) =>
            `${c.firstName} ${c.lastName} (${c.pfaId}, ${c.position}, last ${c.lastSeason})`,
        )
        .join('; ')}`,
    );

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
      `Inserted ${inserted} player(s) (${candidates.length - inserted} already present at insert time). ` +
        'Next: ingest-pfa-football writes their pfa-<pfaId> corpus objects, then derive-football-season-stats.',
    );

    // players.position feeds football_player_eligible_positions (LS-10553).
    // Non-fatal, same as seed-football-players.
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
