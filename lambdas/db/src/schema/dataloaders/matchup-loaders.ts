/**
 * Matchup DataLoaders — matchup players, matchups, games, messages, seasons, playoffs
 */

import DataLoader from 'dataloader';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

/**
 * DataLoader for matchup player games
 * Key: matchupPlayerId (number)
 * Returns: Array of games for that matchup player
 */
export const createMatchupPlayerGamesLoader = (
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
 * DataLoader for matchup players (resolves matchupPlayerId → { playerId, matchupId })
 * Used by MatchupPlayerGame resolvers to avoid per-item MP lookups.
 * Key: matchupPlayerId (number)
 */
export const createMatchupPlayersLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
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
        mpMap.set(row.id, {
          playerId: row.playerId,
          matchupId: row.matchupId,
        });
      }
      return keys.map((key) => mpMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for matchups (resolves matchupId → { leagueId, weekNumber })
 * Used by MatchupPlayerGame resolvers to avoid per-item matchup lookups.
 * Key: matchupId (number)
 */
export const createMatchupsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    {
      leagueId: number;
      weekNumber: number;
      gamesPerMatchup: number | null;
      spStartsPerMatchup: number | null;
    } | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select({
        id: PublicSchema.matchups.id,
        leagueId: PublicSchema.matchups.leagueId,
        weekNumber: PublicSchema.matchups.weekNumber,
        gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
        spStartsPerMatchup: PublicSchema.matchups.spStartsPerMatchup,
      })
      .from(PublicSchema.matchups)
      .where(inArray(PublicSchema.matchups.id, ids));

    const mMap = new Map<
      number,
      {
        leagueId: number;
        weekNumber: number;
        gamesPerMatchup: number | null;
        spStartsPerMatchup: number | null;
      }
    >();
    for (const row of rows) {
      mMap.set(row.id, {
        leagueId: row.leagueId,
        weekNumber: row.weekNumber,
        gamesPerMatchup: row.gamesPerMatchup,
        spStartsPerMatchup: row.spStartsPerMatchup,
      });
    }
    return keys.map((key) => mMap.get(key) ?? null);
  });

/**
 * DataLoader for league-week-player seasons
 * Key: "leagueId-weekNumber-playerId"
 * Returns: season number or null
 */
export const createLeagueWeekPlayerSeasonsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, number | null>(async (keys) => {
    const lookups = keys.map((key) => {
      const [leagueId, weekNumber, playerId] = key.split('-').map(Number);
      return { leagueId, weekNumber, playerId };
    });

    // Deduplicate (leagueId, weekNumber) pairs and fetch all player seasons in
    // a single query. We OR-together per-pair AND clauses rather than using
    // PostgreSQL's tuple-IN syntax (`(col_a, col_b) IN (VALUES (a, b))`) — that
    // syntax fails inside node-postgres prepared statements when the VALUES
    // list contains parameters, because pg can't infer column types from
    // unanchored bind parameters and rejects the comparison. The OR pattern is
    // a single round-trip and still lets PostgreSQL use the composite index on
    // (league_id, week_number).
    const pairs = [
      ...new Map(
        lookups.map((l) => [
          `${l.leagueId}-${l.weekNumber}`,
          { leagueId: l.leagueId, weekNumber: l.weekNumber },
        ]),
      ).values(),
    ];
    const allRows = pairs.length
      ? await db
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
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                    weekNumber,
                  ),
                ),
              ),
            ),
          )
      : [];

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
export const createSelectedGamesCountLoader = (
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
 * DataLoader for matchup messages
 * Key: messageId (number)
 * Returns: matchup message record (for replyToMessage lookups)
 */
export const createMatchupMessagesLoader = (
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
export const createPlayoffMatchupsByBracketLoader = (
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
