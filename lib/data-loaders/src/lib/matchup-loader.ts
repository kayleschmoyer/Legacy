import DataLoader from 'dataloader';
import {
  Matchup,
  MatchupPlayer,
  MatchupPlayerGame,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { inArray } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';

/**
 * DataLoader for matchups by ID
 * Prevents N+1 queries when loading multiple matchups
 */
export function createMatchupLoader(
  db: PublicDb,
): DataLoader<number, Matchup | null> {
  return new DataLoader<number, Matchup | null>(async (matchupIds) => {
    LOGGER.debug(`Batch loading ${matchupIds.length} matchups`);

    const matchups = await db
      .select()
      .from(PublicSchema.matchups)
      .where(inArray(PublicSchema.matchups.id, matchupIds as number[]));

    // Create a map for O(1) lookups
    const matchupMap = new Map<number, Matchup>();
    matchups.forEach((matchup) => {
      matchupMap.set(matchup.id, matchup);
    });

    // Return results in the same order as requested IDs
    return matchupIds.map((id) => matchupMap.get(id) || null);
  });
}

/**
 * DataLoader for matchups by league ID
 * Efficiently loads all matchups for a league
 */
export function createMatchupsByLeagueLoader(
  db: PublicDb,
): DataLoader<number, Matchup[]> {
  return new DataLoader<number, Matchup[]>(async (leagueIds) => {
    LOGGER.debug(`Batch loading matchups for ${leagueIds.length} leagues`);

    const matchups = await db
      .select()
      .from(PublicSchema.matchups)
      .where(inArray(PublicSchema.matchups.leagueId, leagueIds as number[]));

    // Group matchups by league ID
    const matchupsByLeague = new Map<number, Matchup[]>();
    matchups.forEach((matchup) => {
      const existing = matchupsByLeague.get(matchup.leagueId) || [];
      existing.push(matchup);
      matchupsByLeague.set(matchup.leagueId, existing);
    });

    // Return results in the same order as requested league IDs
    return leagueIds.map((leagueId) => matchupsByLeague.get(leagueId) || []);
  });
}

/**
 * DataLoader for matchup players by matchup ID
 * Prevents N+1 queries when loading players for multiple matchups
 */
export function createMatchupPlayersLoader(
  db: PublicDb,
): DataLoader<number, MatchupPlayer[]> {
  return new DataLoader<number, MatchupPlayer[]>(async (matchupIds) => {
    LOGGER.debug(
      `Batch loading matchup players for ${matchupIds.length} matchups`,
    );

    const matchupPlayers = await db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(
        inArray(PublicSchema.matchupPlayers.matchupId, matchupIds as number[]),
      );

    // Group matchup players by matchup ID
    const playersByMatchup = new Map<number, MatchupPlayer[]>();
    matchupPlayers.forEach((matchupPlayer) => {
      const existing = playersByMatchup.get(matchupPlayer.matchupId) || [];
      existing.push(matchupPlayer);
      playersByMatchup.set(matchupPlayer.matchupId, existing);
    });

    // Return results in the same order as requested matchup IDs
    return matchupIds.map((matchupId) => playersByMatchup.get(matchupId) || []);
  });
}

/**
 * DataLoader for matchup player games by matchup player ID
 * Prevents N+1 queries when loading games for multiple matchup players
 */
export function createMatchupPlayerGamesLoader(
  db: PublicDb,
): DataLoader<number, MatchupPlayerGame[]> {
  return new DataLoader<number, MatchupPlayerGame[]>(
    async (matchupPlayerIds) => {
      LOGGER.debug(
        `Batch loading matchup player games for ${matchupPlayerIds.length} matchup players`,
      );

      const matchupPlayerGames = await db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .where(
          inArray(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            matchupPlayerIds as number[],
          ),
        );

      // Group matchup player games by matchup player ID
      const gamesByMatchupPlayer = new Map<number, MatchupPlayerGame[]>();
      matchupPlayerGames.forEach((game) => {
        const existing = gamesByMatchupPlayer.get(game.matchupPlayerId) || [];
        existing.push(game);
        gamesByMatchupPlayer.set(game.matchupPlayerId, existing);
      });

      // Return results in the same order as requested matchup player IDs
      return matchupPlayerIds.map(
        (matchupPlayerId): MatchupPlayerGame[] =>
          gamesByMatchupPlayer.get(matchupPlayerId) || [],
      );
    },
  );
}

/**
 * DataLoader for single matchup player by ID
 * Useful for direct ID lookups
 */
export function createMatchupPlayerLoader(
  db: PublicDb,
): DataLoader<number, MatchupPlayer | null> {
  return new DataLoader<number, MatchupPlayer | null>(
    async (matchupPlayerIds) => {
      LOGGER.debug(
        `Batch loading ${matchupPlayerIds.length} matchup players by ID`,
      );

      const matchupPlayers = await db
        .select()
        .from(PublicSchema.matchupPlayers)
        .where(
          inArray(PublicSchema.matchupPlayers.id, matchupPlayerIds as number[]),
        );

      // Create a map for O(1) lookups
      const matchupPlayerMap = new Map<number, MatchupPlayer>();
      matchupPlayers.forEach((matchupPlayer) => {
        matchupPlayerMap.set(matchupPlayer.id, matchupPlayer);
      });

      // Return results in the same order as requested IDs
      return matchupPlayerIds.map((id) => matchupPlayerMap.get(id) || null);
    },
  );
}

/**
 * Context object containing all matchup-related DataLoaders
 * Use this in your GraphQL context to prevent N+1 queries
 */
export interface MatchupLoaderContext {
  matchupLoader: DataLoader<number, Matchup | null>;
  matchupsByLeagueLoader: DataLoader<number, Matchup[]>;
  matchupPlayersLoader: DataLoader<number, MatchupPlayer[]>;
  matchupPlayerGamesLoader: DataLoader<number, MatchupPlayerGame[]>;
  matchupPlayerLoader: DataLoader<number, MatchupPlayer | null>;
}

/**
 * Creates all matchup-related DataLoaders
 * Call this when creating your GraphQL context
 *
 * @example
 * ```typescript
 * const context = {
 *   db,
 *   matchupLoaders: createMatchupLoaders(db),
 * };
 * ```
 */
export function createMatchupLoaders(db: PublicDb): MatchupLoaderContext {
  return {
    matchupLoader: createMatchupLoader(db),
    matchupsByLeagueLoader: createMatchupsByLeagueLoader(db),
    matchupPlayersLoader: createMatchupPlayersLoader(db),
    matchupPlayerGamesLoader: createMatchupPlayerGamesLoader(db),
    matchupPlayerLoader: createMatchupPlayerLoader(db),
  };
}
