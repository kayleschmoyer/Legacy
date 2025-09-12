import { SQSEvent } from 'aws-lambda';
import { handler } from './create-matchup';

describe('CreateMatchup', () => {
  it.skip('selects a season', async () => {
    await handler({
      Records: [
        {
          body: JSON.stringify({
            league: 1,
            week: 1,
          }),
        },
      ],
    } as SQSEvent);
  });
});
