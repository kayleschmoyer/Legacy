import { FOOTBALL_PLAYER_DETAIL_POLL_MS } from './playerDetailPolling';

describe('FOOTBALL_PLAYER_DETAIL_POLL_MS', () => {
  it('refreshes at least once per minute so status changes surface promptly (LS-6252)', () => {
    expect(FOOTBALL_PLAYER_DETAIL_POLL_MS).toBeGreaterThan(0);
    expect(FOOTBALL_PLAYER_DETAIL_POLL_MS).toBeLessThanOrEqual(60_000);
  });
});
