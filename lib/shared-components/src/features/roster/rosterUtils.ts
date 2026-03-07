/**
 * Shared utilities for roster/matchup displays.
 *
 * Exported from @legacy-sports/shared-components so that both the cross-platform
 * MatchupRosterEditorView and the web-only MatchupRosterComparison can share the
 * same ordering and helper logic without duplication.
 */

/**
 * Canonical display order for position slot types.
 *
 * Non-overlapping between batters (0–19) and pitchers (20+) so that all slots
 * can be sorted together and pitchers always follow batters.
 */
export const POSITION_SLOT_ORDER: Record<string, number> = {
  // Batters
  C: 0,
  '1B': 1,
  '2B': 2,
  SS: 3,
  '3B': 4,
  LF: 5,
  CF: 6,
  RF: 7,
  OF: 8,
  IF: 9,
  DH: 10,
  XDH: 11,
  // Pitchers
  SP: 20,
  RP: 21,
};

export const PITCHER_POSITION_TYPES = new Set<string>(['SP', 'RP']);

/** Returns true when the given position slot type is a pitching slot. */
export function isPitcherPositionType(posType: string): boolean {
  return PITCHER_POSITION_TYPES.has(posType.toUpperCase());
}

/** Returns Tamagui color tokens for a position badge. Uses only design-system tokens. */
export function getPositionColors(position: string | null | undefined): {
  bg: string;
  text: string;
} {
  if (!position) return { bg: '$gray4', text: '$gray11' };
  const pos = position.toUpperCase();
  if (pos === 'C') return { bg: '$amber3', text: '$amber11' };
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos))
    return { bg: '$blue3', text: '$blue11' };
  if (['LF', 'CF', 'RF', 'OF'].includes(pos))
    return { bg: '$green3', text: '$green11' };
  if (pos === 'SP') return { bg: '$amber6', text: '$amber12' };
  if (pos === 'RP') return { bg: '$red3', text: '$red11' };
  if (['DH', 'XDH', 'UT', 'UTIL'].includes(pos))
    return { bg: '$red7', text: '$red12' };
  return { bg: '$gray4', text: '$gray11' };
}
