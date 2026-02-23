/**
 * Entity DataLoaders — teams, players, users, and eligible positions
 */

import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';
import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

/**
 * DataLoader for teams
 * Key: teamId (number)
 */
export const createTeamsLoader = (db: GenericDatabase<typeof PublicSchema>) =>
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
export const createPlayersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
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
export const createUsersLoader = (db: GenericDatabase<typeof PublicSchema>) =>
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
 * DataLoader for player eligible positions
 * Key: playerId (number)
 * Returns: string[] of position codes, sorted by games played (most to least)
 */
export const createEligiblePositionsLoader = (
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
