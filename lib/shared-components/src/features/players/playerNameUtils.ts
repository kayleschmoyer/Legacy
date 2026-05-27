import { PlayerFragment } from './PlayersApi';

/**
 * Pure helpers shared by the Players Page editorial shell (LS-4646) and the
 * dense list-row view (LS-4650). Extracted to a leaf module so PlayerListRow
 * can consume them without creating a `PlayersScreen → PlayersGrid →
 * PlayerListRow → PlayersScreen` import cycle.
 */

/** Two-letter uppercase initials with an em-dash fallback. */
export function initialsOf(player: PlayerFragment): string {
  const first = player.firstName?.trim()?.[0] ?? '';
  const last = player.lastName?.trim()?.[0] ?? '';
  return (first + last).toUpperCase() || '—';
}

/** Trimmed `First Last` with missing parts elided (no stray whitespace). */
export function fullName(player: PlayerFragment): string {
  return [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
}
