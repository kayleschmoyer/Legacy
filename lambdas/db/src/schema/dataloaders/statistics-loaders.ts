/**
 * Statistics DataLoaders — career, season, and game-level stats
 */

import DataLoader from 'dataloader';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
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
      const allStats: (typeof PublicSchema.seasonBatting.$inferSelect)[] = [];
      for (const batch of chunk(lookups, 50)) {
        const rows = await db
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
    const allStats: (typeof PublicSchema.seasonPitching.$inferSelect)[] = [];
    for (const batch of chunk(lookups, 50)) {
      const rows = await db
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
    const allStats: (typeof PublicSchema.seasonFielding.$inferSelect)[] = [];
    for (const batch of chunk(lookups, 50)) {
      const rows = await db
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
