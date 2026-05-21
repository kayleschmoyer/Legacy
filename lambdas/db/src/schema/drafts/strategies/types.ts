/**
 * Auto-pick strategy types (LS-4665 / ADR 0011 §5).
 *
 * `SportKind` is defined locally here until the sport_kind enum lands as a
 * Postgres type + GraphQL enum (epic LS-4568, slices 1 & 2). Once that ships,
 * this type collapses to a re-export of the shared union.
 */

import type { PlayerDraftInfo } from '../candidate-pool';

export type SportKind = 'baseball' | 'football';

export interface AutoPickScore {
  /** Selected player id. `undefined` only when the candidate pool is empty. */
  playerId: number | undefined;
  /** Human-readable rationale for logs and the UI pick history. */
  reason: string;
}

export interface AutoPickStrategy {
  readonly sport: SportKind;
  /**
   * Pick the best candidate for an unfilled-position scenario.
   *
   * Returns `{ playerId: undefined, reason: '' }` when no player matches any
   * unfilled need — callers handle the bench/fallback path.
   */
  scoreForUnfilledPositions(
    playerDraftInfo: Map<number, PlayerDraftInfo>,
    unfilledPositionTypes: string[],
  ): AutoPickScore;
}
