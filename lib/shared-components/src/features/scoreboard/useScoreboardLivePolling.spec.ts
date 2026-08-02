import { SCOREBOARD_LIVE_POLL_MS } from './useScoreboardLivePolling';

describe('SCOREBOARD_LIVE_POLL_MS', () => {
  it('polls within the 5-8s live-game cadence (LS-7259)', () => {
    expect(SCOREBOARD_LIVE_POLL_MS).toBeGreaterThanOrEqual(5_000);
    expect(SCOREBOARD_LIVE_POLL_MS).toBeLessThanOrEqual(8_000);
  });
});
