/**
 * Tests for the matchup-lock refresh helpers (LS-4034).
 *
 * The roster UI in LeagueDetailPage uses `PlayerMatchupData.isLocked` to
 * disable lineup interactions for players whose matchup has started. Without
 * any refresh, the cached value goes stale and the user can keep clicking
 * locked rows; the mutations then fail silently.
 *
 * The fix has two cooperating pieces, both exercised here:
 *   1. `MATCHUP_LOCK_POLL_INTERVAL_MS` — passed to Apollo's `pollInterval`
 *      so the lock flag refreshes on its own without user interaction.
 *   2. `handleRosterMutationError` — invoked from every roster-mutation
 *      catch block to log the failure AND refetch matchup data so the UI
 *      snaps to the true lock state immediately after a rejected click.
 */

import {
  handleRosterMutationError,
  MATCHUP_LOCK_POLL_INTERVAL_MS,
} from './matchup-lock-refresh';

describe('MATCHUP_LOCK_POLL_INTERVAL_MS', () => {
  it('bounds matchup-lock staleness to 30 seconds', () => {
    // 30s is the precedent set by NotificationDropdown's poll cadence and
    // is the contract the LeagueDetailPage query relies on. Changing it
    // here without intentional review would silently widen the window in
    // which a user can act on stale lock state and trigger LS-4034 again.
    expect(MATCHUP_LOCK_POLL_INTERVAL_MS).toBe(30_000);
  });
});

describe('handleRosterMutationError', () => {
  let logger: { error: jest.Mock };

  beforeEach(() => {
    logger = { error: jest.fn() };
  });

  it('logs the original Error instance so Rollbar can capture the stack', () => {
    const error = new Error('Server rejected: matchup locked');

    handleRosterMutationError({
      error,
      logger,
      logPrefix: 'Error assigning player:',
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error assigning player:', error);
    // Same reference — not a stringified copy.
    expect(logger.error.mock.calls[0][1]).toBe(error);
  });

  it('falls back to a String() representation when error is not an Error', () => {
    handleRosterMutationError({
      error: 'plain string failure',
      logger,
      logPrefix: 'Error removing player:',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Error removing player:',
      'plain string failure',
    );
  });

  it('stringifies non-Error objects so they satisfy LogArgs', () => {
    handleRosterMutationError({
      error: { code: 42, message: 'nope' },
      logger,
      logPrefix: 'Error swapping players:',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Error swapping players:',
      '[object Object]',
    );
  });

  it('calls refetchMatchupPlayers so a stale UI lock state snaps to truth', () => {
    const refetchMatchupPlayers = jest.fn(() => Promise.resolve());

    handleRosterMutationError({
      error: new Error('boom'),
      logger,
      logPrefix: 'Error assigning player:',
      refetchMatchupPlayers,
    });

    expect(refetchMatchupPlayers).toHaveBeenCalledTimes(1);
  });

  it('does not throw when refetchMatchupPlayers rejects (fire-and-forget)', () => {
    // The handler intentionally does not await the refetch — the user-facing
    // failure has already been logged. A rejected refetch must not bubble up
    // and crash the catch block.
    const refetchMatchupPlayers = jest.fn(() =>
      Promise.reject(new Error('refetch failed')),
    );

    expect(() =>
      handleRosterMutationError({
        error: new Error('mutation failed'),
        logger,
        logPrefix: 'Error assigning player:',
        refetchMatchupPlayers,
      }),
    ).not.toThrow();

    expect(refetchMatchupPlayers).toHaveBeenCalledTimes(1);
  });

  it('skips refetch when no matchup is displayed (refetch omitted)', () => {
    // When `displayedMatchupIdNum` is null, the matchup-players query was
    // skipped, so there is nothing to refetch and no lock state to
    // reconcile. The helper must tolerate this.
    expect(() =>
      handleRosterMutationError({
        error: new Error('boom'),
        logger,
        logPrefix: 'Error assigning player:',
      }),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('skips refetch when refetchMatchupPlayers is explicitly null', () => {
    // The call sites in LeagueDetailPage pass `null` (not undefined) when
    // there is no active matchup. Both forms must behave the same.
    const refetchMatchupPlayers = jest.fn(() => Promise.resolve());

    handleRosterMutationError({
      error: new Error('boom'),
      logger,
      logPrefix: 'Error assigning player:',
      refetchMatchupPlayers: null,
    });

    expect(refetchMatchupPlayers).not.toHaveBeenCalled();
  });
});
