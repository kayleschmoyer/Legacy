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
  /** Optional custom nickname for this player on this roster. (LS-1813) */
  nickname?: string | null;
}

/**
 * Format a player's display name from a team-member object.
 * Returns the nickname if set, otherwise the full name.
 * Returns "Unknown Player" if the player data is missing.
 */
export function getPlayerName(
  teamMember: TeamMemberLike | null | undefined,
): string {
  if (!teamMember?.player) return 'Unknown Player';
  if (teamMember.nickname) return teamMember.nickname;

  const { firstName, lastName } = teamMember.player;
  return `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown Player';
}

/**
 * Format an eligiblePositions array into the canonical slash-separated display
 * string (e.g. ['1B', 'OF'] → '1B/OF'). Returns an em dash when the list is
 * empty or absent, matching the fallback used across position display contexts.
 */
export function formatEligiblePositions(
  positions: string[] | null | undefined,
): string {
  return (positions ?? []).join('/') || '—';
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
