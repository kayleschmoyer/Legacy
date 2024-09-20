import { handler, PopulateGameStatsEvent } from './populate-game-stats';

describe('PopulateGame', () => {
  it.skip('populates missing games', async () => {
    await handler({} as PopulateGameStatsEvent);
  });
});
