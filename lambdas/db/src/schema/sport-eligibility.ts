/**
 * Sport-eligibility helpers for trade, waiver, and free-agent validation.
 *
 * A player's `sport` column (added in LS-246) must match the league's `sport`
 * before any roster change is executed. This prevents cross-sport moves
 * (e.g. a baseball player added to a football league) from slipping through
 * without an explicit error.
 */

import type { SportKind } from '@legacy-sports/utils/positions';
import { UserInputError } from './graphql-errors';

export interface PlayerSportRow {
  playerId: number;
  sport: string;
}

/**
 * Throws a descriptive UserInputError if any player's sport does not match the
 * league's sport. Call this before any roster mutation (trade accept, waiver
 * claim, etc.).
 */
export function assertSportCompatibility(
  players: PlayerSportRow[],
  leagueSport: SportKind,
): void {
  for (const { playerId, sport } of players) {
    if (sport !== leagueSport) {
      throw UserInputError(
        `Player ${playerId} is a ${sport} player and cannot be added to a ${leagueSport} league`,
      );
    }
  }
}
