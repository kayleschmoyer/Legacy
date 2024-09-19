import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import memoizeOne from 'memoize-one';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  getDbConnection,
  getPlayerByBrefId,
  PublicSchema,
} from '@legacy-sports/db-client';
import { BaseDbConnection } from 'lib/db-client/src/lib/client/abstract/BaseDbClient';

const getDb = memoizeOne(async () => {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);

  await connection.initialize();

  return connection;
});

async function loadPlayer(
  dbClient: BaseDbConnection<typeof PublicSchema>,
  brefId: string
): Promise<void> {
  LOGGER.debug(`Importing ${brefId}`);

  const player = await getPlayerByBrefId(dbClient.db, brefId);

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  await loadCareerStats(dbClient.db, player.brefId);
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug(event);

  const dbClient = await getDb();

  for (const record of event.Records) {
    await loadPlayer(dbClient, JSON.parse(record.body) as string);
  }

  await dbClient.close();

  LOGGER.debug('done');

  return {
    batchItemFailures: [],
  };
};
