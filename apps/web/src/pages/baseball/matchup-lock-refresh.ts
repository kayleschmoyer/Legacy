/**
 * Helpers for keeping the roster UI's matchup-lock state honest (LS-4034).
 *
 * The bug: when a matchup locks server-side while the user already has the
 * roster page open, the cached PlayerMatchupData stays stale and the UI
 * keeps accepting drag/click interactions. The mutation then fails on the
 * server and the error is only logged.
 *
 * Mitigation:
 *   - Poll the matchup-players query so the lock flag stays fresh.
 *   - On any roster mutation rejection, refetch matchup data immediately so
 *     the UI snaps to truth without waiting for the next poll tick.
 */

import type { LogArgs } from '@legacy-sports/logging';

/**
 * Poll interval (ms) for the `getMatchupPlayers` query that drives
 * `PlayerMatchupData.isLocked`. 30s matches the precedent in
 * NotificationDropdown and bounds staleness to the same window.
 */
export const MATCHUP_LOCK_POLL_INTERVAL_MS = 30_000;

interface RosterMutationErrorLogger {
  error(message: string, ...args: LogArgs): void;
}

export interface HandleRosterMutationErrorParams {
  /** The thrown value from a mutation's catch block (typed as `unknown`). */
  error: unknown;
  /** Logger to record the failure on. */
  logger: RosterMutationErrorLogger;
  /** Human-readable prefix for the log line, e.g. `'Error assigning player:'`. */
  logPrefix: string;
  /**
   * Apollo refetch for the active matchup-players query. Omit (or pass null)
   * when no matchup is currently displayed — in that case there is no lock
   * state to reconcile.
   */
  refetchMatchupPlayers?: (() => Promise<unknown>) | null;
}

/**
 * Log a roster-mutation failure and refresh matchup data so a stale UI
 * (e.g. a lock state that flipped server-side mid-session) snaps to truth.
 *
 * Narrows the catch's `unknown` to either an `Error` (so Rollbar gets a full
 * stack trace) or a string (graceful fallback for non-Error rejections).
 */
export function handleRosterMutationError({
  error,
  logger,
  logPrefix,
  refetchMatchupPlayers,
}: HandleRosterMutationErrorParams): void {
  logger.error(logPrefix, error instanceof Error ? error : String(error));
  if (refetchMatchupPlayers) {
    // Fire-and-forget; swallow a rejected refetch so it doesn't surface as
    // an unhandled rejection — the user-facing failure is already logged
    // above and the next poll tick will retry naturally.
    refetchMatchupPlayers().catch(() => undefined);
  }
}
