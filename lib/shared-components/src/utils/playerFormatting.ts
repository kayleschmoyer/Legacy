/**
 * Shared player name formatting utilities.
 *
 * Centralises the getPlayerName pattern found in LeagueRosterManagement (web & mobile).
 */

/**
 * Minimal player shape — works with both GraphQL fragment types
 * and the PositionModels types.
 */
interface PlayerLike {
  firstName?: string | null;
  lastName?: string | null;
}

interface TeamMemberLike {
  player?: PlayerLike | null;
}

/**
 * Format a player's full name from a team-member object.
 * Returns "Unknown Player" if the player data is missing.
 */
export function getPlayerName(
  teamMember: TeamMemberLike | null | undefined,
): string {
  if (!teamMember?.player) return 'Unknown Player';

  const { firstName, lastName } = teamMember.player;
  return `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown Player';
}

/**
 * Format a player's abbreviated name (e.g. "M. Trout").
 */
export function getPlayerAbbreviatedName(
  teamMember: TeamMemberLike | null | undefined,
): string {
  if (!teamMember?.player) return 'Unknown';

  const { firstName, lastName } = teamMember.player;

  if (!lastName) return firstName || 'Unknown';
  if (!firstName) return lastName;

  return `${firstName.charAt(0)}. ${lastName}`;
}
