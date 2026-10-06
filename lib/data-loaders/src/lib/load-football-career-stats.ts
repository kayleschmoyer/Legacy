import {
  CareerStats,
  isPfrForbiddenError,
  TeamDefense,
} from '@legacy-sports/pfr-client';
import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import type {
  FootballSeasonDefense,
  FootballSeasonDefenseIdp,
  FootballSeasonKicking,
  FootballSeasonPassing,
  FootballSeasonReceiving,
  FootballSeasonRushing,
} from '@legacy-sports/pfr-client';

// First modern NFL season (AFL-NFL merger)
const NFL_SEASON_START = 1970;

function currentYear(): number {
  return new Date().getFullYear();
}

// Sums two nullable numbers, treating null as 0 for summation.
function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

// Aggregate season passing rows into career totals. The aggregate*Seasons
// builders are exported so the LS-10586 corpus derivation
// (derive-football-season-stats.ts) rebuilds career rows the same way.
export function aggregatePassingSeasons(
  seasons: FootballSeasonPassing[],
  playerId: number,
): typeof PublicSchema.careerFootballPassing.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let cmp: number | null = null;
  let att: number | null = null;
  let yds: number | null = null;
  let td: number | null = null;
  let intCareer: number | null = null;
  let sacked: number | null = null;
  let sackYds: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    cmp = sumNullable(cmp, s.cmp);
    att = sumNullable(att, s.att);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    intCareer = sumNullable(intCareer, s.int);
    sacked = sumNullable(sacked, s.sacked);
    sackYds = sumNullable(sackYds, s.sackYds);
  }

  if (!att || att === 0) return null;

  // Shared with the season-row combiner in pfr-client, which needs the same
  // formula to rebuild a traded player's multi-team season.
  const rating = CareerStats.computePasserRating(
    cmp ?? 0,
    att,
    yds ?? 0,
    td ?? 0,
    intCareer ?? 0,
  );

  return {
    playerId,
    g,
    cmp,
    att,
    yds,
    td,
    int: intCareer,
    sacked,
    sackYds,
    rating,
  };
}

export function aggregateRushingSeasons(
  seasons: FootballSeasonRushing[],
  playerId: number,
): typeof PublicSchema.careerFootballRushing.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let att: number | null = null;
  let yds: number | null = null;
  let td: number | null = null;
  let lng: number | null = null;
  let fumbles: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    att = sumNullable(att, s.att);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    fumbles = sumNullable(fumbles, s.fumbles);
    if (s.lng !== null) lng = Math.max(lng ?? s.lng, s.lng);
  }

  if (!att || att === 0) return null;
  // career_football_rushing has no first_downs column (season-only stat) —
  // firstDowns is intentionally not carried into the career aggregate.
  return { playerId, g, att, yds, td, lng, fumbles };
}

export function aggregateReceivingSeasons(
  seasons: FootballSeasonReceiving[],
  playerId: number,
): typeof PublicSchema.careerFootballReceiving.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let rec: number | null = null;
  let tgt: number | null = null;
  let yds: number | null = null;
  let td: number | null = null;
  let lng: number | null = null;
  let fumbles: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    rec = sumNullable(rec, s.rec);
    tgt = sumNullable(tgt, s.tgt);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    fumbles = sumNullable(fumbles, s.fumbles);
    if (s.lng !== null) lng = Math.max(lng ?? s.lng, s.lng);
  }

  if (!rec || rec === 0) return null;
  // career_football_receiving has no first_downs column (season-only stat) —
  // firstDowns is intentionally not carried into the career aggregate.
  return { playerId, g, rec, tgt, yds, td, lng, fumbles };
}

export function aggregateKickingSeasons(
  seasons: FootballSeasonKicking[],
  playerId: number,
): typeof PublicSchema.careerFootballKicking.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let fgm: number | null = null;
  let fga: number | null = null;
  let xpm: number | null = null;
  let xpa: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    fgm = sumNullable(fgm, s.fgm);
    fga = sumNullable(fga, s.fga);
    xpm = sumNullable(xpm, s.xpm);
    xpa = sumNullable(xpa, s.xpa);
  }

  if (!fga || fga === 0) return null;
  return {
    playerId,
    g,
    fgm,
    fga,
    fg019m: null,
    fg019a: null,
    fg2029m: null,
    fg2029a: null,
    fg3039m: null,
    fg3039a: null,
    fg4049m: null,
    fg4049a: null,
    fg50m: null,
    fg50a: null,
    xpm,
    xpa,
    lng: null,
  };
}

export function aggregateDefenseSeasons(
  seasons: FootballSeasonDefense[],
  playerId: number,
): typeof PublicSchema.careerFootballDefense.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let sacks: number | null = null;
  let intCareer: number | null = null;
  let fumblesRec: number | null = null;
  let defTd: number | null = null;
  let safeties: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    sacks = sumNullable(sacks, s.sacks);
    intCareer = sumNullable(intCareer, s.int);
    fumblesRec = sumNullable(fumblesRec, s.fumRec);
    defTd = sumNullable(defTd, s.defTd);
    safeties = sumNullable(safeties, s.safeties);
  }

  return {
    playerId,
    g,
    sacks,
    int: intCareer,
    fumRec: fumblesRec,
    defTd,
    safeties,
    ptsAllowedPerG: null,
    ydsAllowedPerG: null,
  };
}

async function upsertCareerPassing(
  db: PublicDb,
  row: typeof PublicSchema.careerFootballPassing.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.careerFootballPassing)
    .values(row)
    .onConflictDoUpdate({
      target: PublicSchema.careerFootballPassing.playerId,
      set: {
        g: sql`excluded.g`,
        cmp: sql`excluded.cmp`,
        att: sql`excluded.att`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        int: sql`excluded.int`,
        sacked: sql`excluded.sacked`,
        sackYds: sql`excluded.sack_yds`,
        rating: sql`excluded.rating`,
      },
    });
}

async function upsertCareerRushing(
  db: PublicDb,
  row: typeof PublicSchema.careerFootballRushing.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.careerFootballRushing)
    .values(row)
    .onConflictDoUpdate({
      target: PublicSchema.careerFootballRushing.playerId,
      set: {
        g: sql`excluded.g`,
        att: sql`excluded.att`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        lng: sql`excluded.lng`,
        fumbles: sql`excluded.fumbles`,
      },
    });
}

async function upsertCareerReceiving(
  db: PublicDb,
  row: typeof PublicSchema.careerFootballReceiving.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.careerFootballReceiving)
    .values(row)
    .onConflictDoUpdate({
      target: PublicSchema.careerFootballReceiving.playerId,
      set: {
        g: sql`excluded.g`,
        rec: sql`excluded.rec`,
        tgt: sql`excluded.tgt`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        lng: sql`excluded.lng`,
        fumbles: sql`excluded.fumbles`,
      },
    });
}

async function upsertCareerKicking(
  db: PublicDb,
  row: typeof PublicSchema.careerFootballKicking.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.careerFootballKicking)
    .values(row)
    .onConflictDoUpdate({
      target: PublicSchema.careerFootballKicking.playerId,
      set: {
        g: sql`excluded.g`,
        fgm: sql`excluded.fgm`,
        fga: sql`excluded.fga`,
        fg019m: sql`excluded.fg_0_19m`,
        fg019a: sql`excluded.fg_0_19a`,
        fg2029m: sql`excluded.fg_20_29m`,
        fg2029a: sql`excluded.fg_20_29a`,
        fg3039m: sql`excluded.fg_30_39m`,
        fg3039a: sql`excluded.fg_30_39a`,
        fg4049m: sql`excluded.fg_40_49m`,
        fg4049a: sql`excluded.fg_40_49a`,
        fg50m: sql`excluded.fg_50m`,
        fg50a: sql`excluded.fg_50a`,
        xpm: sql`excluded.xpm`,
        xpa: sql`excluded.xpa`,
        lng: sql`excluded.lng`,
      },
    });
}

async function upsertCareerDefense(
  db: PublicDb,
  row: typeof PublicSchema.careerFootballDefense.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.careerFootballDefense)
    .values(row)
    .onConflictDoUpdate({
      target: PublicSchema.careerFootballDefense.playerId,
      set: {
        g: sql`excluded.g`,
        sacks: sql`excluded.sacks`,
        int: sql`excluded.int`,
        fumRec: sql`excluded.fumbles_rec`,
        defTd: sql`excluded.def_td`,
        safeties: sql`excluded.safeties`,
        ptsAllowedPerG: sql`excluded.pts_allowed_per_g`,
        ydsAllowedPerG: sql`excluded.yds_allowed_per_g`,
      },
    });
}

export async function upsertSeasonPassing(
  db: PublicDb,
  row: typeof PublicSchema.footballSeasonPassing.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.footballSeasonPassing)
    .values(row)
    .onConflictDoUpdate({
      target: [
        PublicSchema.footballSeasonPassing.playerId,
        PublicSchema.footballSeasonPassing.season,
        PublicSchema.footballSeasonPassing.team,
        PublicSchema.footballSeasonPassing.pfrRowId,
      ],
      set: {
        g: sql`excluded.g`,
        gs: sql`excluded.gs`,
        cmp: sql`excluded.cmp`,
        att: sql`excluded.att`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        int: sql`excluded.int`,
        firstDowns: sql`excluded.first_downs`,
        sacked: sql`excluded.sacked`,
        sackYds: sql`excluded.sack_yds`,
        lng: sql`excluded.lng`,
        rating: sql`excluded.rating`,
      },
    });
}

export async function upsertSeasonRushing(
  db: PublicDb,
  row: typeof PublicSchema.footballSeasonRushing.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.footballSeasonRushing)
    .values(row)
    .onConflictDoUpdate({
      target: [
        PublicSchema.footballSeasonRushing.playerId,
        PublicSchema.footballSeasonRushing.season,
        PublicSchema.footballSeasonRushing.team,
        PublicSchema.footballSeasonRushing.pfrRowId,
      ],
      set: {
        g: sql`excluded.g`,
        gs: sql`excluded.gs`,
        att: sql`excluded.att`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        lng: sql`excluded.lng`,
        firstDowns: sql`excluded.first_downs`,
        fumbles: sql`excluded.fumbles`,
        ydsPerAtt: sql`excluded.yds_per_att`,
      },
    });
}

export async function upsertSeasonReceiving(
  db: PublicDb,
  row: typeof PublicSchema.footballSeasonReceiving.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.footballSeasonReceiving)
    .values(row)
    .onConflictDoUpdate({
      target: [
        PublicSchema.footballSeasonReceiving.playerId,
        PublicSchema.footballSeasonReceiving.season,
        PublicSchema.footballSeasonReceiving.team,
        PublicSchema.footballSeasonReceiving.pfrRowId,
      ],
      set: {
        g: sql`excluded.g`,
        gs: sql`excluded.gs`,
        rec: sql`excluded.rec`,
        tgt: sql`excluded.tgt`,
        yds: sql`excluded.yds`,
        td: sql`excluded.td`,
        lng: sql`excluded.lng`,
        firstDowns: sql`excluded.first_downs`,
        fumbles: sql`excluded.fumbles`,
        ydsPerRec: sql`excluded.yds_per_rec`,
      },
    });
}

export async function upsertSeasonKicking(
  db: PublicDb,
  row: typeof PublicSchema.footballSeasonKicking.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.footballSeasonKicking)
    .values(row)
    .onConflictDoUpdate({
      target: [
        PublicSchema.footballSeasonKicking.playerId,
        PublicSchema.footballSeasonKicking.season,
        PublicSchema.footballSeasonKicking.team,
        PublicSchema.footballSeasonKicking.pfrRowId,
      ],
      set: {
        g: sql`excluded.g`,
        fgm: sql`excluded.fgm`,
        fga: sql`excluded.fga`,
        xpm: sql`excluded.xpm`,
        xpa: sql`excluded.xpa`,
      },
    });
}

export async function upsertSeasonDefenseIdp(
  db: PublicDb,
  row: typeof PublicSchema.footballSeasonDefenseIdp.$inferInsert,
): Promise<void> {
  await db
    .insert(PublicSchema.footballSeasonDefenseIdp)
    .values(row)
    .onConflictDoUpdate({
      target: [
        PublicSchema.footballSeasonDefenseIdp.playerId,
        PublicSchema.footballSeasonDefenseIdp.season,
        PublicSchema.footballSeasonDefenseIdp.team,
        PublicSchema.footballSeasonDefenseIdp.pfrRowId,
      ],
      set: {
        g: sql`excluded.g`,
        gs: sql`excluded.gs`,
        soloTkl: sql`excluded.solo_tkl`,
        astTkl: sql`excluded.ast_tkl`,
        totalTkl: sql`excluded.total_tkl`,
        sacks: sql`excluded.sacks`,
        int: sql`excluded.int`,
        pd: sql`excluded.pd`,
        ff: sql`excluded.ff`,
        fr: sql`excluded.fr`,
        defTd: sql`excluded.def_td`,
        safeties: sql`excluded.safeties`,
      },
    });
}

// Season rows are upserted, never deleted, and the conflict target includes
// `team` — so when a season's team label changes, the old row survives beside
// the new one. That matters for the LS-9915 backfill: a traded player's season
// was stored under a single team (Sanu 2019 -> "NWE") and now loads as the
// combined "2TM" line, which would insert alongside the stale row and make the
// career aggregate count the season twice.
//
// After writing a player's rows for a season, drop any other row that player
// still has for that same season. The main page returns the player's whole
// career in one request and we now emit exactly one row per season, so
// everything we did not just write for a fetched season is stale by
// construction. Seasons we did not fetch are left alone.
// The season tables this prune may target. A literal union rather than `string`
// so the sql.raw() below can only ever receive one of these names.
export type FootballSeasonTable =
  | 'football_season_passing'
  | 'football_season_rushing'
  | 'football_season_receiving'
  | 'football_season_kicking'
  | 'football_season_defense_idp';

export async function pruneSupersededSeasonRows(
  db: PublicDb,
  table: FootballSeasonTable,
  playerId: number,
  written: { season: number; team: string }[],
): Promise<void> {
  for (const { season, team } of written) {
    await db.execute(
      sql`DELETE FROM ${sql.raw(table)}
          WHERE player_id = ${playerId}
            AND season = ${season}
            AND team IS DISTINCT FROM ${team}`,
    );
  }
}

export interface FootballCareerResult {
  playerId: number;
  pfrId: string;
  groupsUpserted: string[];
}

// IDP positions that route to career_football_defense_idp. Exported so the
// LS-10586 derivation splits players the same way.
export const IDP_POSITIONS = new Set(['DL', 'LB', 'DB']);

/**
 * Load a football player's career stats and stamp players.stats_last_fetched_at
 * so prioritized batch loaders (`load-football-career --limit`) can skip
 * already-fetched players and resume across runs — mirroring the baseball
 * loader. The timestamp is set only after a successful load (including a clean
 * "no data" result); a thrown error leaves the marker untouched so the player
 * is retried on the next run.
 */
export async function loadFootballCareerStats(
  db: PublicDb,
  playerId: number,
  startSeasonOverride?: number,
): Promise<FootballCareerResult> {
  const result = await loadFootballCareerStatsInner(
    db,
    playerId,
    startSeasonOverride,
  );
  // total_games = career games played. A player's rushing/receiving/etc.
  // rows describe the same games, so take the max across tables, not the sum
  // (LS-10647 — 20 Questions medium/hard pools filter on it).
  await db.execute(sql`
    UPDATE players
    SET stats_last_fetched_at = NOW(),
        total_games = GREATEST(
          COALESCE((SELECT g FROM career_football_passing   WHERE player_id = ${playerId}), 0),
          COALESCE((SELECT g FROM career_football_rushing   WHERE player_id = ${playerId}), 0),
          COALESCE((SELECT g FROM career_football_receiving WHERE player_id = ${playerId}), 0),
          COALESCE((SELECT g FROM career_football_kicking   WHERE player_id = ${playerId}), 0),
          COALESCE((SELECT g FROM career_football_defense   WHERE player_id = ${playerId}), 0),
          COALESCE((SELECT MAX(g) FROM career_football_defense_idp WHERE player_id = ${playerId}), 0)
        )
    WHERE id = ${playerId}
  `);
  return result;
}

async function loadFootballCareerStatsInner(
  db: PublicDb,
  playerId: number,
  startSeasonOverride?: number,
): Promise<FootballCareerResult> {
  const playerRows = await db
    .select()
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.id, playerId));

  const player = playerRows[0];
  if (!player) {
    throw new Error(`Player not found: ${playerId}`);
  }

  const { pfrId, isDst, nflTeam, position } = player;

  if (!pfrId) {
    throw new Error(
      `Player ${playerId} has no pfrId — cannot load football career stats`,
    );
  }

  const pfrPlayer = { id: playerId, pfrId };
  const groupsUpserted: string[] = [];

  // --- DST path: synthetic team-defense players ---
  if (isDst) {
    if (!nflTeam) {
      throw new Error(`DST player ${playerId} has no nflTeam`);
    }

    const startYear = startSeasonOverride ?? NFL_SEASON_START;
    const endYear = currentYear();
    const defenseSeasons: FootballSeasonDefense[] = [];

    LOGGER.info(
      `Loading DST career stats for player ${playerId} (team: ${nflTeam}, ` +
        `seasons ${startYear}–${endYear})`,
    );

    for (let season = startYear; season <= endYear; season++) {
      try {
        const totals = await TeamDefense.getSeasonTotals(
          pfrPlayer,
          nflTeam,
          season,
        );
        if (totals) {
          defenseSeasons.push(totals);
        }
      } catch (err) {
        // A 403 means PFR auth has expired — every subsequent request for
        // every player will also fail, so propagate it instead of grinding
        // through the remaining seasons. Other errors (missing season page,
        // etc.) are treated as "no data for this season" and swallowed.
        if (isPfrForbiddenError(err)) throw err;
        LOGGER.warn(
          `Failed to fetch DST season ${season} for ${nflTeam}:`,
          err instanceof Error ? err : String(err),
        );
      }
    }

    const career = aggregateDefenseSeasons(defenseSeasons, playerId);
    if (career) {
      await upsertCareerDefense(db, career);
      groupsUpserted.push('defense');
      LOGGER.info(
        `Upserted career_football_defense for DST player ${playerId} ` +
          `(${defenseSeasons.length} seasons)`,
      );
    } else {
      LOGGER.info(
        `No defense data found for DST player ${playerId} (${nflTeam})`,
      );
    }

    return { playerId, pfrId, groupsUpserted };
  }

  // --- IDP path: individual defensive players ---
  // Fetch the player's main page once to get all defensive season totals in a
  // single request (~57x fewer requests than the previous per-season gamelog
  // loop). Season discovery is implicit — only seasons present on the main-page
  // `defense` table are returned, eliminating the 1970→currentYear brute-force
  // iteration (LS-7732, mirroring the offensive path optimised in LS-7692).
  if (position && IDP_POSITIONS.has(position)) {
    LOGGER.info(
      `Loading IDP career stats for player ${playerId} (${pfrId}) via main page`,
    );

    let defenseSeasons: FootballSeasonDefenseIdp[] = [];
    try {
      defenseSeasons =
        await CareerStats.getAllDefenseSeasonTotalsFromMainPage(pfrPlayer);
    } catch (err) {
      if (isPfrForbiddenError(err)) throw err;
      LOGGER.warn(
        `Failed to fetch main page for ${pfrId}:`,
        err instanceof Error ? err : String(err),
      );
    }

    for (const totals of defenseSeasons) {
      await upsertSeasonDefenseIdp(db, {
        playerId,
        season: totals.season,
        team: totals.team,
        g: totals.g,
        gs: totals.gs,
        soloTkl: totals.soloTkl,
        astTkl: totals.astTkl,
        totalTkl: totals.totalTkl,
        sacks: totals.sacks !== null ? String(totals.sacks) : null,
        int: totals.int,
        pd: totals.pd,
        ff: totals.ff,
        fr: totals.fr,
        defTd: totals.defTd,
        safeties: totals.safeties,
        pfrRowId: totals.pfrRowId,
      });
      if (!groupsUpserted.includes('defense_idp')) {
        groupsUpserted.push('defense_idp');
      }
    }

    await pruneSupersededSeasonRows(
      db,
      'football_season_defense_idp',
      playerId,
      defenseSeasons,
    );

    if (groupsUpserted.length > 0) {
      LOGGER.info(
        `Upserted football_season_defense_idp rows for IDP player ${playerId} ` +
          `(${defenseSeasons.length} seasons)`,
      );
    } else {
      LOGGER.info(`No IDP data found for player ${playerId} (${pfrId})`);
    }

    return { playerId, pfrId, groupsUpserted };
  }

  // --- Offensive / kicking path ---
  // Fetch the player's main page once to get all career season totals in a
  // single request (~57x fewer requests than the previous per-season gamelog
  // approach). Season discovery is implicit — only seasons present on the main
  // page are returned, eliminating the 1970→currentYear brute-force iteration.
  LOGGER.info(
    `Loading offensive career stats for player ${playerId} (${pfrId}) via main page`,
  );

  let allSeasonTotals: CareerStats.SeasonTotals[] = [];
  try {
    allSeasonTotals =
      await CareerStats.getAllSeasonTotalsFromMainPage(pfrPlayer);
  } catch (err) {
    if (isPfrForbiddenError(err)) throw err;
    LOGGER.warn(
      `Failed to fetch main page for ${pfrId}:`,
      err instanceof Error ? err : String(err),
    );
  }

  const passingSeasons: FootballSeasonPassing[] = [];
  const rushingSeasons: FootballSeasonRushing[] = [];
  const receivingSeasons: FootballSeasonReceiving[] = [];
  const kickingSeasons: FootballSeasonKicking[] = [];

  // Persist each parsed season row (LS-8513) — previously these were only
  // aggregated into career totals and the season detail was discarded,
  // leaving football_season_* empty. Mirrors upsertSeasonDefenseIdp on the
  // IDP path and the season-level persistence in the baseball loader.
  for (const totals of allSeasonTotals) {
    if (totals.passing) {
      passingSeasons.push(totals.passing);
      const s = totals.passing;
      await upsertSeasonPassing(db, {
        playerId,
        season: s.season,
        team: s.team,
        pfrRowId: s.pfrRowId,
        g: s.g,
        gs: s.gs,
        cmp: s.cmp,
        att: s.att,
        yds: s.yds,
        td: s.td,
        int: s.int,
        firstDowns: s.firstDowns,
        sacked: s.sacked,
        sackYds: s.sackYds,
        lng: s.lng,
        rating: s.rating,
      });
    }
    if (totals.rushing) {
      rushingSeasons.push(totals.rushing);
      const s = totals.rushing;
      await upsertSeasonRushing(db, {
        playerId,
        season: s.season,
        team: s.team,
        pfrRowId: s.pfrRowId,
        g: s.g,
        gs: s.gs,
        att: s.att,
        yds: s.yds,
        td: s.td,
        lng: s.lng,
        firstDowns: s.firstDowns,
        fumbles: s.fumbles,
        ydsPerAtt: s.ydsPerAtt,
      });
    }
    if (totals.receiving) {
      receivingSeasons.push(totals.receiving);
      const s = totals.receiving;
      await upsertSeasonReceiving(db, {
        playerId,
        season: s.season,
        team: s.team,
        pfrRowId: s.pfrRowId,
        g: s.g,
        gs: s.gs,
        rec: s.rec,
        tgt: s.tgt,
        yds: s.yds,
        td: s.td,
        lng: s.lng,
        firstDowns: s.firstDowns,
        fumbles: s.fumbles,
        ydsPerRec: s.ydsPerRec,
      });
    }
    if (totals.kicking) {
      kickingSeasons.push(totals.kicking);
      const s = totals.kicking;
      await upsertSeasonKicking(db, {
        playerId,
        season: s.season,
        team: s.team,
        pfrRowId: s.pfrRowId,
        g: s.g,
        fgm: s.fgm,
        fga: s.fga,
        xpm: s.xpm,
        xpa: s.xpa,
      });
    }
  }

  // Drop rows superseded by this load before the career totals are summed
  // from the season rows — see pruneSupersededSeasonRows.
  await pruneSupersededSeasonRows(
    db,
    'football_season_passing',
    playerId,
    passingSeasons,
  );
  await pruneSupersededSeasonRows(
    db,
    'football_season_rushing',
    playerId,
    rushingSeasons,
  );
  await pruneSupersededSeasonRows(
    db,
    'football_season_receiving',
    playerId,
    receivingSeasons,
  );
  await pruneSupersededSeasonRows(
    db,
    'football_season_kicking',
    playerId,
    kickingSeasons,
  );

  const careerPassing = aggregatePassingSeasons(passingSeasons, playerId);
  if (careerPassing) {
    await upsertCareerPassing(db, careerPassing);
    groupsUpserted.push('passing');
  }

  const careerRushing = aggregateRushingSeasons(rushingSeasons, playerId);
  if (careerRushing) {
    await upsertCareerRushing(db, careerRushing);
    groupsUpserted.push('rushing');
  }

  const careerReceiving = aggregateReceivingSeasons(receivingSeasons, playerId);
  if (careerReceiving) {
    await upsertCareerReceiving(db, careerReceiving);
    groupsUpserted.push('receiving');
  }

  const careerKicking = aggregateKickingSeasons(kickingSeasons, playerId);
  if (careerKicking) {
    await upsertCareerKicking(db, careerKicking);
    groupsUpserted.push('kicking');
  }

  LOGGER.info(
    `Loaded career stats for player ${playerId} (${pfrId}): ` +
      (groupsUpserted.length > 0 ? groupsUpserted.join(', ') : 'no data found'),
  );

  return { playerId, pfrId, groupsUpserted };
}
