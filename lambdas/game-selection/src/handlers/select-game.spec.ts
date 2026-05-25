import { SQSEvent } from 'aws-lambda';
import { handler } from './select-game';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SelectGame', () => {
  it.skip('selects a season', async () => {
    await handler({
      Records: [
        {
          body: JSON.stringify({
            game: 1,
            matchupId: 1,
          }),
        },
      ],
    } as SQSEvent);
  });
});
