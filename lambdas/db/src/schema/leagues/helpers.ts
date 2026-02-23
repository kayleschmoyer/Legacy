/**
 * League domain — Helper utilities
 *
 * Pure / DB-only helpers that don't register any GraphQL types.
 */
import type { Team as DbTeam, PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Fisher-Yates shuffle — returns a new array.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Randomly distribute players across teams (currently unused but preserved).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function randomlyAssignPlayers(
  db: PublicDb,
  leagueId: number,
  teams: DbTeam[],
  maxPlayersPerTeam: number,
) {
  // Get a pool of players (limit to ensure we don't overwhelm the system)
  const availablePlayers: { id: number }[] = await db
    .select({
      id: PublicSchema.players.id,
    })
    .from(PublicSchema.players)
    .limit(teams.length * maxPlayersPerTeam); // Get enough players for all teams

  if (availablePlayers.length === 0) {
    LOGGER.info('No players available for random assignment', { leagueId });
    return [];
  }

  // Shuffle the players for random distribution
  const shuffledPlayers = shuffleArray(availablePlayers);

  interface TeamMemberInsert {
    teamId: number;
    leagueId: number;
    playerId: number;
    positionId: number | null;
  }

  const teamMembers: TeamMemberInsert[] = [];
  let playerIndex = 0;

  // Distribute players evenly across teams
  for (const team of teams) {
    const playersForThisTeam = Math.min(
      maxPlayersPerTeam,
      shuffledPlayers.length - playerIndex,
    );

    for (let i = 0; i < playersForThisTeam; i++) {
      if (playerIndex < shuffledPlayers.length) {
        teamMembers.push({
          teamId: team.id,
          leagueId: leagueId,
          playerId: shuffledPlayers[playerIndex].id,
          positionId: null, // Players start unassigned to specific positions
        });
        playerIndex++;
      }
    }
  }

  // Insert all team members at once
  if (teamMembers.length > 0) {
    await db.insert(PublicSchema.teamMembers).values(teamMembers);
    LOGGER.info('Randomly assigned players to teams', {
      leagueId,
      teamCount: teams.length,
      assignedCount: teamMembers.length,
    });
  }

  return teamMembers;
}
