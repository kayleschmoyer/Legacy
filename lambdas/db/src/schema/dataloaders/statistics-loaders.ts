/**
 * Statistics DataLoaders — career, season, and game-level stats
 */

import DataLoader from 'dataloader';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  type GenericDatabase,
  PublicSchema,
  withPoolTimeoutRetry,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Career Loaders ───────────────────────────────────────────────────────────

/**
 * DataLoader for career batting stats
 */
export const createCareerBattingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, typeof PublicSchema.careerBatting.$inferSelect | null>(
    async (keys) => {
      const rows = await db
        .select()
        .from(PublicSchema.careerBatting)
        .where(inArray(PublicSchema.careerBatting.playerId, keys));
      const map = new Map(rows.map((r) => [r.playerId ?? 0, r]));
      return keys.map((key) => map.get(key) ?? null);
    },
  );

/**
 * DataLoader for career pitching stats
 */
export const createCareerPitchingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerPitching.$inferSelect | null
  >(async (keys) => {
    const rows = await db
      .select()
      .from(PublicSchema.careerPitching)
      .where(inArray(PublicSchema.careerPitching.playerId, keys));
    const map = new Map(rows.map((r) => [r.playerId ?? 0, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for count of seasons played (batting)
 */
export const createBattingSeasonsPlayedLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, number>(async (keys) => {
    // Cast result to number because COUNT returns string or bigint depending on driver
    const rows = await db
      .select({
        playerId: PublicSchema.seasonBatting.playerId,
        seasons: sql<number>`count(distinct ${PublicSchema.seasonBatting.season})::int`,
      })
      .from(PublicSchema.seasonBatting)
      .where(inArray(PublicSchema.seasonBatting.playerId, keys))
      .groupBy(PublicSchema.seasonBatting.playerId);

    const map = new Map(rows.map((r) => [r.playerId, r.seasons]));
    return keys.map((key) => map.get(key) ?? 0);
  });

/**
 * DataLoader for a player's career season count, scoped to the player's sport
 * (LS-10515). Resolves to null — never 0 — when no season rows exist, so the
 * UI can hide the figure instead of showing a false "0 seasons".
 *
 * - baseball: distinct seasons in the union of season_batting and
 *   season_pitching (so pitchers with no batting rows are counted)
 * - football: distinct seasons in the union of the football_season_* tables
 */
export const createCareerSeasonsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, number | null>(async (keys) => {
    const players = await db
      .select({
        id: PublicSchema.players.id,
        sport: PublicSchema.players.sport,
      })
      .from(PublicSchema.players)
      .where(inArray(PublicSchema.players.id, keys));
    const sportById = new Map(players.map((p) => [p.id, p.sport]));
    const baseballIds = keys.filter((k) => sportById.get(k) === 'baseball');
    const footballIds = keys.filter((k) => sportById.get(k) === 'football');

    const seasonsByPlayer = new Map<number, Set<number>>();
    const add = (rows: { playerId: number; season: number }[]) => {
      for (const r of rows) {
        const set = seasonsByPlayer.get(r.playerId) ?? new Set<number>();
        set.add(r.season);
        seasonsByPlayer.set(r.playerId, set);
      }
    };

    const t = PublicSchema;
    const queries: Promise<{ playerId: number; season: number }[]>[] = [];
    if (baseballIds.length > 0) {
      for (const table of [t.seasonBatting, t.seasonPitching]) {
        queries.push(
          db
            .selectDistinct({
              playerId: table.playerId,
              season: table.season,
            })
            .from(table)
            .where(inArray(table.playerId, baseballIds)),
        );
      }
    }
    if (footballIds.length > 0) {
      for (const table of [
        t.footballSeasonPassing,
        t.footballSeasonRushing,
        t.footballSeasonReceiving,
        t.footballSeasonKicking,
        t.footballSeasonDefense,
        t.footballSeasonDefenseIdp,
      ]) {
        queries.push(
          db
            .selectDistinct({
              playerId: table.playerId,
              season: table.season,
            })
            .from(table)
            .where(inArray(table.playerId, footballIds)),
        );
      }
    }
    for (const rows of await Promise.all(queries)) add(rows);

    return keys.map((key) => seasonsByPlayer.get(key)?.size || null);
  });

/**
 * DataLoader for count of distinct AL/NL seasons with a pitching appearance
 * (LS-10807) — read from career_pitching_appearances, the same relation the
 * league pitcher career-minimum rule uses.
 */
export const createPitchingSeasonsPlayedLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, number>(async (keys) => {
    const rows = await db
      .select({
        playerId: PublicSchema.careerPitchingAppearances.playerId,
        seasons: PublicSchema.careerPitchingAppearances.seasons,
      })
      .from(PublicSchema.careerPitchingAppearances)
      .where(inArray(PublicSchema.careerPitchingAppearances.playerId, keys));

    const map = new Map(rows.map((r) => [r.playerId, r.seasons ?? 0]));
    return keys.map((key) => map.get(key) ?? 0);
  });

/**
 * DataLoader for player career year range (min/max season year across AL/NL batting).
 *
 * Used to compute a player's "primary era" for display on player cards and the
 * draft board. The primary era is derived from the midpoint of the career window.
 *
 * Key: playerId (number)
 * Returns: { minYear: number; maxYear: number } | null
 */
export const createCareerYearRangeLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, { minYear: number; maxYear: number } | null>(
    async (keys) => {
      const rows = await db
        .select({
          playerId: PublicSchema.seasonBatting.playerId,
          minYear: sql<number>`MIN(${PublicSchema.seasonBatting.season})::int`,
          maxYear: sql<number>`MAX(${PublicSchema.seasonBatting.season})::int`,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            inArray(PublicSchema.seasonBatting.playerId, keys as number[]),
            inArray(PublicSchema.seasonBatting.lgId, ['AL', 'NL']),
          ),
        )
        .groupBy(PublicSchema.seasonBatting.playerId);
      const map = new Map(
        rows.map((r) => [
          r.playerId,
          { minYear: r.minYear, maxYear: r.maxYear },
        ]),
      );
      return (keys as number[]).map((key) => map.get(key) ?? null);
    },
  );

/**
 * DataLoader for career fielding stats
 * Key: playerId (number)
 * Returns: career fielding record with positionsPlayed JSON
 */
export const createCareerFieldingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFielding.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFielding)
      .where(inArray(PublicSchema.careerFielding.playerId, ids));

    const cfMap = new Map<
      number,
      typeof PublicSchema.careerFielding.$inferSelect
    >();
    for (const row of rows) {
      if (row.playerId !== null) cfMap.set(row.playerId, row);
    }
    return keys.map((key) => cfMap.get(key) ?? null);
  });

// ── Football Career Loaders (LS-8567) ───────────────────────────────────────
//
// FootballPlayer.careerStats reads 1-4 career_football_* category tables per
// row (see careerStatCategoriesForPlayer in schema/football.ts). At pageSize
// 100 that was up to ~400 point reads per request. These loaders key on
// playerId so every row's request for a given category coalesces into one
// query per category per GraphQL response, mirroring the MLB career loaders
// above.

/**
 * DataLoader for career football passing stats
 * Key: playerId (number)
 */
export const createCareerFootballPassingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballPassing.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballPassing)
      .where(inArray(PublicSchema.careerFootballPassing.playerId, ids));
    const map = new Map(rows.map((r) => [r.playerId, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for career football rushing stats
 * Key: playerId (number)
 */
export const createCareerFootballRushingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballRushing.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballRushing)
      .where(inArray(PublicSchema.careerFootballRushing.playerId, ids));
    const map = new Map(rows.map((r) => [r.playerId, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for career football receiving stats
 * Key: playerId (number)
 */
export const createCareerFootballReceivingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballReceiving.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballReceiving)
      .where(inArray(PublicSchema.careerFootballReceiving.playerId, ids));
    const map = new Map(rows.map((r) => [r.playerId, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for career football kicking stats
 * Key: playerId (number)
 */
export const createCareerFootballKickingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballKicking.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballKicking)
      .where(inArray(PublicSchema.careerFootballKicking.playerId, ids));
    const map = new Map(rows.map((r) => [r.playerId, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for career football (team) defense stats
 * Key: playerId (number) — synthetic DST "player" id
 */
export const createCareerFootballDefenseLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballDefense.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballDefense)
      .where(inArray(PublicSchema.careerFootballDefense.playerId, ids));
    const map = new Map(rows.map((r) => [r.playerId, r]));
    return keys.map((key) => map.get(key) ?? null);
  });

/**
 * DataLoader for career football IDP (individual defender) stats.
 * Backed by the `career_football_defense_idp` view (SUM of
 * football_season_defense_idp grouped by player_id).
 * Key: playerId (number)
 */
export const createCareerFootballDefenseIdpLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    typeof PublicSchema.careerFootballDefenseIdp.$inferSelect | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.careerFootballDefenseIdp)
      .where(inArray(PublicSchema.careerFootballDefenseIdp.playerId, ids));

    const map = new Map<
      number,
      typeof PublicSchema.careerFootballDefenseIdp.$inferSelect
    >();
    for (const row of rows) {
      if (row.playerId !== null) map.set(row.playerId, row);
    }
    return keys.map((key) => map.get(key) ?? null);
  });

// ── Season Loaders ───────────────────────────────────────────────────────────

/**
 * DataLoader for season batting stats
 * Key format: "playerId-season" (e.g., "1234-2019")
 */
export const createSeasonBattingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, typeof PublicSchema.seasonBatting.$inferSelect | null>(
    async (keys) => {
      // Parse keys into lookup objects
      const lookups = keys.map((key) => {
        const [playerId, season] = key.split('-').map(Number);
        return { playerId, season };
      });

      // Chunk into batches of 50 to avoid unbounded OR conditions on large leagues.
      // Each chunk generates: WHERE (pid=A AND season=B) OR (pid=C AND season=D) OR ...
      // Wrapped in withPoolTimeoutRetry (LS-8478 pattern): this loader fires
      // on the same Matchup.winProbability per-player fan-out as
      // createSeasonPitchingLoader below. See LS-10037.
      const allStats: (typeof PublicSchema.seasonBatting.$inferSelect)[] = [];
      for (const batch of chunk(lookups, 50)) {
        const rows = await withPoolTimeoutRetry(() =>
          db
            .select()
            .from(PublicSchema.seasonBatting)
            .where(
              or(
                ...batch.map(({ playerId, season }) =>
                  and(
                    eq(PublicSchema.seasonBatting.playerId, playerId),
                    eq(PublicSchema.seasonBatting.season, season),
                  ),
                ),
              ),
            ),
        );
        allStats.push(...rows);
      }

      // Create a map for fast lookup
      const statsMap = new Map<
        string,
        typeof PublicSchema.seasonBatting.$inferSelect
      >();
      allStats.forEach((stat) => {
        const key = `${stat.playerId}-${stat.season}`;
        statsMap.set(key, stat);
      });

      // Return results in the same order as keys
      return keys.map((key) => statsMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for season pitching stats
 * Key format: "playerId-season" (e.g., "1234-2019")
 */
export const createSeasonPitchingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    string,
    typeof PublicSchema.seasonPitching.$inferSelect | null
  >(async (keys) => {
    // Parse keys into lookup objects
    const lookups = keys.map((key) => {
      const [playerId, season] = key.split('-').map(Number);
      return { playerId, season };
    });

    // Chunk into batches of 50 to avoid unbounded OR conditions on large leagues.
    // Wrapped in withPoolTimeoutRetry (LS-8478 pattern): this is the exact
    // call site in the LS-10037 Rollbar trace (item 250) — a burst of
    // concurrent Matchup.winProbability fan-out exhausting the shared pool.
    const allStats: (typeof PublicSchema.seasonPitching.$inferSelect)[] = [];
    for (const batch of chunk(lookups, 50)) {
      const rows = await withPoolTimeoutRetry(() =>
        db
          .select()
          .from(PublicSchema.seasonPitching)
          .where(
            or(
              ...batch.map(({ playerId, season }) =>
                and(
                  eq(PublicSchema.seasonPitching.playerId, playerId),
                  eq(PublicSchema.seasonPitching.season, season),
                ),
              ),
            ),
          ),
      );
      allStats.push(...rows);
    }

    // Create a map for fast lookup
    const statsMap = new Map<
      string,
      typeof PublicSchema.seasonPitching.$inferSelect
    >();
    allStats.forEach((stat) => {
      const key = `${stat.playerId}-${stat.season}`;
      statsMap.set(key, stat);
    });

    // Return results in the same order as keys
    return keys.map((key) => statsMap.get(key) ?? null);
  });

/**
 * DataLoader for season fielding stats
 * Key format: "playerId-season" (e.g., "1234-2019")
 */
export const createSeasonFieldingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    string,
    typeof PublicSchema.seasonFielding.$inferSelect | null
  >(async (keys) => {
    // Parse keys into lookup objects
    const lookups = keys.map((key) => {
      const [playerId, season] = key.split('-').map(Number);
      return { playerId, season };
    });

    // Chunk into batches of 50 to avoid unbounded OR conditions on large leagues.
    // Wrapped in withPoolTimeoutRetry (LS-8478 pattern): same fan-out
    // exposure as createSeasonBattingLoader/createSeasonPitchingLoader above.
    const allStats: (typeof PublicSchema.seasonFielding.$inferSelect)[] = [];
    for (const batch of chunk(lookups, 50)) {
      const rows = await withPoolTimeoutRetry(() =>
        db
          .select()
          .from(PublicSchema.seasonFielding)
          .where(
            or(
              ...batch.map(({ playerId, season }) =>
                and(
                  eq(PublicSchema.seasonFielding.playerId, playerId),
                  eq(PublicSchema.seasonFielding.season, season),
                ),
              ),
            ),
          ),
      );
      allStats.push(...rows);
    }

    // Create a map for fast lookup
    const statsMap = new Map<
      string,
      typeof PublicSchema.seasonFielding.$inferSelect
    >();
    allStats.forEach((stat) => {
      const key = `${stat.playerId}-${stat.season}`;
      statsMap.set(key, stat);
    });

    // Return results in the same order as keys
    return keys.map((key) => statsMap.get(key) ?? null);
  });

// ── Game Loaders ─────────────────────────────────────────────────────────────

/**
 * DataLoader for game batting stats
 * Key format: "playerId-season-gameIdentifier" (e.g., "1234-2019-CLE201905010")
 */
export const createGameBattingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, typeof PublicSchema.gameBatting.$inferSelect | null>(
    async (keys) => {
      LOGGER.debug(`[gameBatting loader] Looking up ${keys.length} keys`);

      const lookups = keys.map((key) => {
        const parts = key.split('-');
        const playerId = Number(parts[0]);
        const season = Number(parts[1]);
        const gameIdentifier = parts.slice(2).join('-');
        return { playerId, season, gameIdentifier };
      });

      // Batch: fetch all rows matching any (playerId, season) pair then filter
      const pairKeys = [
        ...new Set(lookups.map((l) => `${l.playerId}-${l.season}`)),
      ];
      const pairs = pairKeys.map((k) => {
        const [pid, s] = k.split('-').map(Number);
        return { playerId: pid, season: s };
      });

      const allStats: (typeof PublicSchema.gameBatting.$inferSelect)[] = [];
      for (const batch of chunk(pairs, 50)) {
        const rows = await db
          .select()
          .from(PublicSchema.gameBatting)
          .where(
            or(
              ...batch.map(({ playerId, season }) =>
                and(
                  eq(PublicSchema.gameBatting.playerId, playerId),
                  eq(PublicSchema.gameBatting.season, season),
                ),
              ),
            ),
          );
        allStats.push(...rows);
      }

      // Index by composite key
      const statsMap = new Map<
        string,
        typeof PublicSchema.gameBatting.$inferSelect
      >();
      for (const stat of allStats) {
        statsMap.set(
          `${stat.playerId}-${stat.season}-${stat.gameIdentifier}`,
          stat,
        );
        // Also index by gameNum for backward compat
        statsMap.set(`${stat.playerId}-${stat.season}-${stat.gameNum}`, stat);
      }

      return keys.map((key) => statsMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for game pitching stats
 * Key format: "playerId-season-gameIdentifier"
 */
export const createGamePitchingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, typeof PublicSchema.gamePitching.$inferSelect | null>(
    async (keys) => {
      const lookups = keys.map((key) => {
        const parts = key.split('-');
        return { playerId: Number(parts[0]), season: Number(parts[1]) };
      });

      const pairKeys = [
        ...new Set(lookups.map((l) => `${l.playerId}-${l.season}`)),
      ];
      const pairs = pairKeys.map((k) => {
        const [pid, s] = k.split('-').map(Number);
        return { playerId: pid, season: s };
      });

      const allStats: (typeof PublicSchema.gamePitching.$inferSelect)[] = [];
      for (const batch of chunk(pairs, 50)) {
        const rows = await db
          .select()
          .from(PublicSchema.gamePitching)
          .where(
            or(
              ...batch.map(({ playerId, season }) =>
                and(
                  eq(PublicSchema.gamePitching.playerId, playerId),
                  eq(PublicSchema.gamePitching.season, season),
                ),
              ),
            ),
          );
        allStats.push(...rows);
      }

      const statsMap = new Map<
        string,
        typeof PublicSchema.gamePitching.$inferSelect
      >();
      for (const stat of allStats) {
        statsMap.set(
          `${stat.playerId}-${stat.season}-${stat.gameIdentifier}`,
          stat,
        );
        statsMap.set(`${stat.playerId}-${stat.season}-${stat.gameNum}`, stat);
      }

      return keys.map((key) => statsMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for game fielding stats
 * Key format: "playerId-season-gameIdentifier"
 */
export const createGameFieldingLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, typeof PublicSchema.gameFielding.$inferSelect | null>(
    async (keys) => {
      const lookups = keys.map((key) => {
        const parts = key.split('-');
        return { playerId: Number(parts[0]), season: Number(parts[1]) };
      });

      const pairKeys = [
        ...new Set(lookups.map((l) => `${l.playerId}-${l.season}`)),
      ];
      const pairs = pairKeys.map((k) => {
        const [pid, s] = k.split('-').map(Number);
        return { playerId: pid, season: s };
      });

      const allStats: (typeof PublicSchema.gameFielding.$inferSelect)[] = [];
      for (const batch of chunk(pairs, 50)) {
        const rows = await db
          .select()
          .from(PublicSchema.gameFielding)
          .where(
            or(
              ...batch.map(({ playerId, season }) =>
                and(
                  eq(PublicSchema.gameFielding.playerId, playerId),
                  eq(PublicSchema.gameFielding.season, season),
                ),
              ),
            ),
          );
        allStats.push(...rows);
      }

      const statsMap = new Map<
        string,
        typeof PublicSchema.gameFielding.$inferSelect
      >();
      for (const stat of allStats) {
        statsMap.set(
          `${stat.playerId}-${stat.season}-${stat.gameIdentifier}`,
          stat,
        );
        statsMap.set(`${stat.playerId}-${stat.season}-${stat.gameNum}`, stat);
      }

      return keys.map((key) => statsMap.get(key) ?? null);
    },
  );
