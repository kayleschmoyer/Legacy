import DataLoader from 'dataloader';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

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

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

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

/**
 * DataLoader for season batting stats
 * Key format: "playerId-season" (e.g., "1234-2019")
 */
const createSeasonBattingLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<string, typeof PublicSchema.seasonBatting.$inferSelect | null>(
    async (keys) => {
      // Parse keys into lookup objects
      const lookups = keys.map((key) => {
        const [playerId, season] = key.split('-').map(Number);
        return { playerId, season };
      });

      // Fetch all stats in a single batched query
      const allStats = await db
        .select()
        .from(PublicSchema.seasonBatting)
        .where(
          or(
            ...lookups.map(({ playerId, season }) =>
              and(
                eq(PublicSchema.seasonBatting.playerId, playerId),
                eq(PublicSchema.seasonBatting.season, season),
              ),
            ),
          ),
        );

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
const createSeasonPitchingLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<
    string,
    typeof PublicSchema.seasonPitching.$inferSelect | null
  >(async (keys) => {
    // Parse keys into lookup objects
    const lookups = keys.map((key) => {
      const [playerId, season] = key.split('-').map(Number);
      return { playerId, season };
    });

    // Fetch all stats in a single batched query
    const allStats = await db
      .select()
      .from(PublicSchema.seasonPitching)
      .where(
        or(
          ...lookups.map(({ playerId, season }) =>
            and(
              eq(PublicSchema.seasonPitching.playerId, playerId),
              eq(PublicSchema.seasonPitching.season, season),
            ),
          ),
        ),
      );

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
const createSeasonFieldingLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<
    string,
    typeof PublicSchema.seasonFielding.$inferSelect | null
  >(async (keys) => {
    // Parse keys into lookup objects
    const lookups = keys.map((key) => {
      const [playerId, season] = key.split('-').map(Number);
      return { playerId, season };
    });

    // Fetch all stats in a single batched query
    const allStats = await db
      .select()
      .from(PublicSchema.seasonFielding)
      .where(
        or(
          ...lookups.map(({ playerId, season }) =>
            and(
              eq(PublicSchema.seasonFielding.playerId, playerId),
              eq(PublicSchema.seasonFielding.season, season),
            ),
          ),
        ),
      );

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

/**
 * DataLoader for teams
 * Key: teamId (number)
 */
const createTeamsLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, typeof PublicSchema.teams.$inferSelect | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const allTeams = await db
        .select()
        .from(PublicSchema.teams)
        .where(inArray(PublicSchema.teams.id, ids));

      const teamsMap = new Map<
        number,
        typeof PublicSchema.teams.$inferSelect
      >();
      for (const team of allTeams) teamsMap.set(team.id, team);
      return keys.map((key) => teamsMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for players
 * Key: playerId (number)
 */
const createPlayersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, typeof PublicSchema.players.$inferSelect | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const allPlayers = await db
        .select()
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.id, ids));

      const playersMap = new Map<
        number,
        typeof PublicSchema.players.$inferSelect
      >();
      for (const player of allPlayers) playersMap.set(player.id, player);
      return keys.map((key) => playersMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for users
 * Key: userId (number)
 */
const createUsersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<
    number,
    {
      id: number;
      email: string | null;
      username: string | null;
      accessLevel: string | null;
    } | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const allUsers = await db
      .select({
        id: PublicSchema.users.id,
        email: PublicSchema.users.email,
        username: PublicSchema.users.username,
        accessLevel: PublicSchema.users.accessLevel,
      })
      .from(PublicSchema.users)
      .where(inArray(PublicSchema.users.id, ids));

    const usersMap = new Map<
      number,
      {
        id: number;
        email: string | null;
        username: string | null;
        accessLevel: string | null;
      }
    >();
    for (const user of allUsers) {
      if (user.id !== null) {
        usersMap.set(user.id, {
          id: user.id,
          email: user.email,
          username: user.username,
          accessLevel: user.accessLevel,
        });
      }
    }
    return keys.map((key) => usersMap.get(key) ?? null);
  });

/**
 * DataLoader for matchup player games
 * Key: matchupPlayerId (number)
 * Returns: Array of games for that matchup player
 */
const createMatchupPlayerGamesLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    Array<typeof PublicSchema.matchupPlayerGames.$inferSelect>
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const allGames = await db
      .select()
      .from(PublicSchema.matchupPlayerGames)
      .where(inArray(PublicSchema.matchupPlayerGames.matchupPlayerId, ids));

    const gamesMap = new Map<
      number,
      Array<typeof PublicSchema.matchupPlayerGames.$inferSelect>
    >();
    for (const game of allGames) {
      let arr = gamesMap.get(game.matchupPlayerId);
      if (!arr) {
        arr = [];
        gamesMap.set(game.matchupPlayerId, arr);
      }
      arr.push(game);
    }

    return keys.map((key) => gamesMap.get(key) ?? []);
  });

/**
 * DataLoader for player eligible positions
 * Key: playerId (number)
 * Returns: string[] of position codes, sorted by games played (most to least)
 */
const createEligiblePositionsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, string[]>(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select({
        playerId: PublicSchema.playerEligiblePositions.playerId,
        position: PublicSchema.playerEligiblePositions.position,
        games: PublicSchema.playerEligiblePositions.games,
      })
      .from(PublicSchema.playerEligiblePositions)
      .where(inArray(PublicSchema.playerEligiblePositions.playerId, ids));

    const posMap = new Map<
      number,
      Array<{ position: string; games: number }>
    >();
    for (const row of rows) {
      let arr = posMap.get(row.playerId);
      if (!arr) {
        arr = [];
        posMap.set(row.playerId, arr);
      }
      arr.push({ position: row.position, games: row.games });
    }

    // Sort positions by games played (descending) and return just the position strings
    return keys.map((key) => {
      const positions = posMap.get(key);
      if (!positions) return [];
      return positions.sort((a, b) => b.games - a.games).map((p) => p.position);
    });
  });

/**
 * DataLoader for matchup players (resolves matchupPlayerId → { playerId, matchupId })
 * Used by MatchupPlayerGame resolvers to avoid per-item MP lookups.
 * Key: matchupPlayerId (number)
 */
const createMatchupPlayersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, { playerId: number; matchupId: number } | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const rows = await db
        .select({
          id: PublicSchema.matchupPlayers.id,
          playerId: PublicSchema.matchupPlayers.playerId,
          matchupId: PublicSchema.matchupPlayers.matchupId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(inArray(PublicSchema.matchupPlayers.id, ids));

      const mpMap = new Map<number, { playerId: number; matchupId: number }>();
      for (const row of rows) {
        mpMap.set(row.id, { playerId: row.playerId, matchupId: row.matchupId });
      }
      return keys.map((key) => mpMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for matchups (resolves matchupId → { leagueId, weekNumber })
 * Used by MatchupPlayerGame resolvers to avoid per-item matchup lookups.
 * Key: matchupId (number)
 */
const createMatchupsLoader = (db: GenericDatabase<typeof PublicSchema>) =>
  new DataLoader<number, { leagueId: number; weekNumber: number } | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const rows = await db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(inArray(PublicSchema.matchups.id, ids));

      const mMap = new Map<number, { leagueId: number; weekNumber: number }>();
      for (const row of rows) {
        mMap.set(row.id, {
          leagueId: row.leagueId,
          weekNumber: row.weekNumber,
        });
      }
      return keys.map((key) => mMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for league-week-player seasons
 * Key: "leagueId-weekNumber-playerId"
 * Returns: season number or null
 */
const createLeagueWeekPlayerSeasonsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, number | null>(async (keys) => {
    const lookups = keys.map((key) => {
      const [leagueId, weekNumber, playerId] = key.split('-').map(Number);
      return { leagueId, weekNumber, playerId };
    });

    // Deduplicate (leagueId, weekNumber) pairs and fetch all player seasons for those
    const pairKeys = [
      ...new Set(lookups.map((l) => `${l.leagueId}-${l.weekNumber}`)),
    ];
    const allRows: {
      leagueId: number;
      weekNumber: number;
      playerId: number;
      season: number;
    }[] = [];
    for (const batch of chunk(pairKeys, 20)) {
      const pairs = batch.map((k) => {
        const [lid, wn] = k.split('-').map(Number);
        return { leagueId: lid, weekNumber: wn };
      });
      const rows = await db
        .select({
          leagueId: PublicSchema.leagueWeekPlayerSeasons.leagueId,
          weekNumber: PublicSchema.leagueWeekPlayerSeasons.weekNumber,
          playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          or(
            ...pairs.map(({ leagueId, weekNumber }) =>
              and(
                eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
                eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
              ),
            ),
          ),
        );
      allRows.push(...rows);
    }

    const seasonMap = new Map<string, number>();
    for (const row of allRows) {
      seasonMap.set(
        `${row.leagueId}-${row.weekNumber}-${row.playerId}`,
        row.season,
      );
    }

    return keys.map((key) => seasonMap.get(key) ?? null);
  });

/**
 * DataLoader for selectedGamesCount per matchup
 * Key: matchupId (number)
 * Returns: count of distinct game_num values
 */
const createSelectedGamesCountLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, number>(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select({
        matchupId: PublicSchema.matchupPlayers.matchupId,
        count: sql<number>`COUNT(DISTINCT ${PublicSchema.matchupPlayerGames.gameNum})`,
      })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayerGames.matchupPlayerId,
          PublicSchema.matchupPlayers.id,
        ),
      )
      .where(inArray(PublicSchema.matchupPlayers.matchupId, ids))
      .groupBy(PublicSchema.matchupPlayers.matchupId);

    const countMap = new Map<number, number>();
    for (const row of rows) countMap.set(row.matchupId, row.count);
    return keys.map((key) => countMap.get(key) ?? 0);
  });

/**
 * DataLoader for career fielding stats
 * Key: playerId (number)
 * Returns: career fielding record with positionsPlayed JSON
 */
const createCareerFieldingLoader = (db: GenericDatabase<typeof PublicSchema>) =>
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

/**
 * DataLoader for matchup messages
 * Key: messageId (number)
 * Returns: matchup message record (for replyToMessage lookups)
 */
const createMatchupMessagesLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    | (typeof PublicSchema.matchupMessages.$inferSelect & {
        metadata: Record<string, unknown>;
      })
    | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.matchupMessages)
      .where(inArray(PublicSchema.matchupMessages.id, ids));

    const messagesMap = new Map<
      number,
      typeof PublicSchema.matchupMessages.$inferSelect & {
        metadata: Record<string, unknown>;
      }
    >();
    for (const row of rows) {
      messagesMap.set(row.id, {
        ...row,
        metadata: row.metadata as Record<string, unknown>,
      });
    }
    return keys.map((key) => messagesMap.get(key) ?? null);
  });

/**
 * DataLoader for playoff matchups by bracket
 * Key: bracketId (number)
 * Returns: Array of playoff matchups for that bracket (sorted by round, matchupNumber)
 */
const createPlayoffMatchupsByBracketLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    Array<typeof PublicSchema.playoffMatchups.$inferSelect>
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.playoffMatchups)
      .where(inArray(PublicSchema.playoffMatchups.bracketId, ids))
      .orderBy(
        sql`${PublicSchema.playoffMatchups.bracketId}`,
        sql`${PublicSchema.playoffMatchups.round}`,
        sql`${PublicSchema.playoffMatchups.matchupNumber}`,
      );

    const matchupsMap = new Map<
      number,
      Array<typeof PublicSchema.playoffMatchups.$inferSelect>
    >();
    for (const row of rows) {
      let arr = matchupsMap.get(row.bracketId);
      if (!arr) {
        arr = [];
        matchupsMap.set(row.bracketId, arr);
      }
      arr.push(row);
    }

    return keys.map((key) => matchupsMap.get(key) ?? []);
  });

/**
 * Create all loaders for GraphQL context
 * Accepts a shared database connection instead of creating its own
 */
export const createLoaders = (db: GenericDatabase<typeof PublicSchema>) => ({
  gameBatting: createGameBattingLoader(db),
  gamePitching: createGamePitchingLoader(db),
  gameFielding: createGameFieldingLoader(db),
  seasonBatting: createSeasonBattingLoader(db),
  seasonPitching: createSeasonPitchingLoader(db),
  seasonFielding: createSeasonFieldingLoader(db),
  teams: createTeamsLoader(db),
  players: createPlayersLoader(db),
  users: createUsersLoader(db),
  matchupPlayerGames: createMatchupPlayerGamesLoader(db),
  eligiblePositions: createEligiblePositionsLoader(db),
  matchupPlayersById: createMatchupPlayersLoader(db),
  matchupsById: createMatchupsLoader(db),
  leagueWeekPlayerSeasons: createLeagueWeekPlayerSeasonsLoader(db),
  selectedGamesCount: createSelectedGamesCountLoader(db),
  careerFielding: createCareerFieldingLoader(db),
  careerBatting: createCareerBattingLoader(db),
  battingSeasonsPlayed: createBattingSeasonsPlayedLoader(db),
  matchupMessages: createMatchupMessagesLoader(db),
  playoffMatchupsByBracket: createPlayoffMatchupsByBracketLoader(db),
});

/**
 * Type definition for loaders object
 */
export type Loaders = ReturnType<typeof createLoaders>;
