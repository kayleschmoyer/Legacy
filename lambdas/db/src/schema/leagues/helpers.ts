/**
 * League domain — Helper utilities
 *
 * Pure / DB-only helpers that don't register any GraphQL types.
 */

import type { Team as DbTeam, PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { shuffleArray } from '@legacy-sports/utils';
import { randomBytes } from 'node:crypto';

/**
 * Character set for league invite codes: a Crockford-style alphabet that omits
 * visually ambiguous characters (0/O, 1/I/L). Exactly 32 characters — a power
 * of two — so masking a random byte with `0x1f` selects a character uniformly
 * with zero modulo bias and no rejection sampling.
 */
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a cryptographically secure league invite code.
 *
 * Invite codes grant access to a league, so they must be unguessable. This uses
 * Node's `crypto.randomBytes` (a CSPRNG) rather than `Math.random`, which is not
 * suitable for access-granting tokens. Because the alphabet length is a power of
 * two, `byte & 0x1f` maps each random byte to a character uniformly.
 */
export function generateSecureInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[bytes[i] & 0x1f];
  }
  return code;
}

/**
 * Randomly distribute players across teams (currently unused but preserved).
 */
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
