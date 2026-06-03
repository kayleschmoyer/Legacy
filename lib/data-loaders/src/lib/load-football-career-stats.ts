import { CareerStats, TeamDefense } from '@legacy-sports/pfr-client';
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

// NFL passer rating formula
function computePasserRating(
  cmp: number,
  att: number,
  yds: number,
  td: number,
  int: number,
): number | null {
  if (att === 0) return null;
  const a = Math.max(0, Math.min((cmp / att - 0.3) / 0.2, 2.375));
  const b = Math.max(0, Math.min((yds / att - 3) / 4, 2.375));
  const c = Math.max(0, Math.min(td / att / 0.05, 2.375));
  const d = Math.max(0, Math.min(0.095 - int / att / 0.04, 2.375));
  return Math.round(((a + b + c + d) / 6) * 100 * 10) / 10;
}

// Sums two nullable numbers, treating null as 0 for summation.
function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

// Aggregate season passing rows into career totals.
function aggregatePassingSeasons(
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
  const sacked: number | null = null;
  const sackYds: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    cmp = sumNullable(cmp, s.cmp);
    att = sumNullable(att, s.att);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    intCareer = sumNullable(intCareer, s.int);
  }

  if (!att || att === 0) return null;

  const rating = computePasserRating(
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
    rating: rating !== null ? String(rating) : null,
  };
}

function aggregateRushingSeasons(
  seasons: FootballSeasonRushing[],
  playerId: number,
): typeof PublicSchema.careerFootballRushing.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let att: number | null = null;
  let yds: number | null = null;
  let td: number | null = null;
  const lng: number | null = null;
  let fumbles: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    att = sumNullable(att, s.att);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    fumbles = sumNullable(fumbles, s.fumbles);
    // lng is per-game data not available in season totals — leave null
  }

  if (!att || att === 0) return null;
  return { playerId, g, att, yds, td, lng, fumbles };
}

function aggregateReceivingSeasons(
  seasons: FootballSeasonReceiving[],
  playerId: number,
): typeof PublicSchema.careerFootballReceiving.$inferInsert | null {
  if (seasons.length === 0) return null;

  let g: number | null = null;
  let rec: number | null = null;
  let tgt: number | null = null;
  let yds: number | null = null;
  let td: number | null = null;
  const lng: number | null = null;
  let fumbles: number | null = null;

  for (const s of seasons) {
    g = sumNullable(g, s.g);
    rec = sumNullable(rec, s.rec);
    tgt = sumNullable(tgt, s.tgt);
    yds = sumNullable(yds, s.yds);
    td = sumNullable(td, s.td);
    fumbles = sumNullable(fumbles, s.fumbles);
  }

  if (!rec || rec === 0) return null;
  return { playerId, g, rec, tgt, yds, td, lng, fumbles };
}

function aggregateKickingSeasons(
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

function aggregateDefenseSeasons(
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
    sacks: sacks !== null ? String(sacks) : null,
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
        fumRec: sql`excluded.fum_rec`,
        defTd: sql`excluded.def_td`,
        safeties: sql`excluded.safeties`,
        ptsAllowedPerG: sql`excluded.pts_allowed_per_g`,
        ydsAllowedPerG: sql`excluded.yds_allowed_per_g`,
      },
    });
}

async function upsertSeasonDefenseIdp(
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

export interface FootballCareerResult {
  playerId: number;
  pfrId: string;
  groupsUpserted: string[];
}

// IDP positions that route to career_football_defense_idp
const IDP_POSITIONS = new Set(['DL', 'LB', 'DB']);

export async function loadFootballCareerStats(
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
    LOGGER.warn(
      `Failed to fetch main page for ${pfrId}:`,
      err instanceof Error ? err : String(err),
    );
  }

  const passingSeasons: FootballSeasonPassing[] = [];
  const rushingSeasons: FootballSeasonRushing[] = [];
  const receivingSeasons: FootballSeasonReceiving[] = [];
  const kickingSeasons: FootballSeasonKicking[] = [];

  for (const totals of allSeasonTotals) {
    if (totals.passing) passingSeasons.push(totals.passing);
    if (totals.rushing) rushingSeasons.push(totals.rushing);
    if (totals.receiving) receivingSeasons.push(totals.receiving);
    if (totals.kicking) kickingSeasons.push(totals.kicking);
  }

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
