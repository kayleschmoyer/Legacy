/**
 * publishMatchupScoreUpdated — LS-6396
 *
 * A stat correction re-runs `updateMatchupScore` outside of batch
 * completion, but previously only `MATCHUP_STATS_COMPLETE` (fired once per
 * batch) propagated over WebSocket — so web clients showed the stale score
 * for up to 30+s. This publishes `matchup_score_updated` on every
 * system-context write instead.
 */
import { publishMatchupScoreUpdated } from './mutations';
import type { Context } from '../builder';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function makeContext(
  overrides: Partial<Context> & {
    notifyMatchupScoreUpdated?: jest.Mock;
  },
): Context {
  const { notifyMatchupScoreUpdated, ...rest } = overrides;
  return {
    isSystemRequest: false,
    notificationService: notifyMatchupScoreUpdated
      ? ({
          notifyMatchupScoreUpdated,
        } as unknown as Context['notificationService'])
      : null,
    ...rest,
  } as Context;
}

describe('publishMatchupScoreUpdated', () => {
  it('publishes matchup_score_updated when the write is system-driven', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const context = makeContext({
      isSystemRequest: true,
      notifyMatchupScoreUpdated: notify,
    });

    await publishMatchupScoreUpdated(context, {
      id: 42,
      leagueId: 7,
      team1Score: '49',
      team2Score: '31.5',
    });

    expect(notify).toHaveBeenCalledWith(42, 7, 49, 31.5);
  });

  it('passes null scores through unchanged', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const context = makeContext({
      isSystemRequest: true,
      notifyMatchupScoreUpdated: notify,
    });

    await publishMatchupScoreUpdated(context, {
      id: 42,
      leagueId: 7,
      team1Score: null,
      team2Score: null,
    });

    expect(notify).toHaveBeenCalledWith(42, 7, null, null);
  });

  it('sends null instead of NaN for a non-numeric score string', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const context = makeContext({
      isSystemRequest: true,
      notifyMatchupScoreUpdated: notify,
    });

    await publishMatchupScoreUpdated(context, {
      id: 42,
      leagueId: 7,
      team1Score: 'invalid',
      team2Score: '31',
    });

    expect(notify).toHaveBeenCalledWith(42, 7, null, 31);
  });

  it('does not publish for a non-system (admin) write', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const context = makeContext({
      isSystemRequest: false,
      notifyMatchupScoreUpdated: notify,
    });

    await publishMatchupScoreUpdated(context, {
      id: 42,
      leagueId: 7,
      team1Score: '49',
      team2Score: '31',
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('is a no-op when no notificationService is configured', async () => {
    const context = makeContext({ isSystemRequest: true });

    await expect(
      publishMatchupScoreUpdated(context, {
        id: 42,
        leagueId: 7,
        team1Score: '49',
        team2Score: '31',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows notification failures (non-fatal)', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('WS send failed'));
    const context = makeContext({
      isSystemRequest: true,
      notifyMatchupScoreUpdated: notify,
    });

    await expect(
      publishMatchupScoreUpdated(context, {
        id: 42,
        leagueId: 7,
        team1Score: '49',
        team2Score: '31',
      }),
    ).resolves.toBeUndefined();
  });
});
