/**
 * Tests for the mobile matchup-lock refresh helpers (LS-5895).
 *
 * Mirrors apps/web/src/pages/baseball/matchup-lock-refresh.spec.ts — the
 * mobile roster editor uses the same two cooperating pieces:
 *   1. `MATCHUP_LOCK_POLL_INTERVAL_MS` — passed to Apollo's `pollInterval`
 *      so the matchup-players query refreshes on its own.
 *   2. `handleRosterMutationError` — invoked from every roster-mutation
 *      catch block to log the failure AND refetch matchup data so the UI
 *      snaps to the true lock state immediately after a rejected mutation.
 */

import {
  handleRosterMutationError,
  MATCHUP_LOCK_POLL_INTERVAL_MS,
} from './matchup-lock-refresh';

describe('MATCHUP_LOCK_POLL_INTERVAL_MS', () => {
  it('bounds matchup-lock staleness to 30 seconds, matching web', () => {
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
      logPrefix: 'Error swapping positions:',
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Error swapping positions:',
      error,
    );
    const [, loggedError] = logger.error.mock.calls[0] as [string, unknown];
    expect(loggedError).toBe(error);
  });

  it('falls back to a String() representation when error is not an Error', () => {
    handleRosterMutationError({
      error: 'plain string failure',
      logger,
      logPrefix: 'Error updating position:',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Error updating position:',
      'plain string failure',
    );
  });

  it('calls refetchMatchupPlayers so a stale UI lock state snaps to truth', () => {
    const refetchMatchupPlayers = jest.fn(() => Promise.resolve());

    handleRosterMutationError({
      error: new Error('boom'),
      logger,
      logPrefix: 'Error swapping positions:',
      refetchMatchupPlayers,
    });

    expect(refetchMatchupPlayers).toHaveBeenCalledTimes(1);
  });

  it('does not throw when refetchMatchupPlayers rejects (fire-and-forget)', () => {
    const refetchMatchupPlayers = jest.fn(() =>
      Promise.reject(new Error('refetch failed')),
    );

    expect(() =>
      handleRosterMutationError({
        error: new Error('mutation failed'),
        logger,
        logPrefix: 'Error swapping positions:',
        refetchMatchupPlayers,
      }),
    ).not.toThrow();

    expect(refetchMatchupPlayers).toHaveBeenCalledTimes(1);
  });

  it('skips refetch when refetchMatchupPlayers is omitted', () => {
    expect(() =>
      handleRosterMutationError({
        error: new Error('boom'),
        logger,
        logPrefix: 'Error swapping positions:',
      }),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('skips refetch when refetchMatchupPlayers is explicitly null', () => {
    const refetchMatchupPlayers = jest.fn(() => Promise.resolve());

    handleRosterMutationError({
      error: new Error('boom'),
      logger,
      logPrefix: 'Error swapping positions:',
      refetchMatchupPlayers: null,
    });

    expect(refetchMatchupPlayers).not.toHaveBeenCalled();
  });
});
