import { SQSEvent } from 'aws-lambda';
import { handler } from './select-game';
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
