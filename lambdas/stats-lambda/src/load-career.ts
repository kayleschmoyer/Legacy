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
  brefId: string,
): Promise<void> {
  LOGGER.debug(`Importing ${brefId}`);

  const player = await getPlayerByBrefId(dbClient.db, brefId);

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  await loadCareerStats(dbClient.db, player.brefId);
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug(JSON.stringify(event));

  const dbClient = await getDb();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  // Process each record individually to handle partial failures
  for (const record of event.Records) {
    try {
      // Validate message format
      if (!record.body) {
        LOGGER.error(`Record ${record.messageId} has no body`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Parse and validate brefId
      let brefId: string;
      try {
        brefId = JSON.parse(record.body) as string;
      } catch (parseError) {
        LOGGER.error(
          `Failed to parse message body for record ${record.messageId}:`,
          parseError as Error,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      if (!brefId || typeof brefId !== 'string') {
        LOGGER.error(`Invalid brefId in record ${record.messageId}: ${brefId}`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Process the player
      await loadPlayer(dbClient, brefId);
      LOGGER.debug(
        `Successfully processed record ${record.messageId} for player ${brefId}`,
      );
    } catch (error) {
      LOGGER.error(
        `Failed to process record ${record.messageId}:`,
        error as Error,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  await dbClient.close();

  LOGGER.debug(
    `Processed ${event.Records.length} records, ${batchItemFailures.length} failures`,
  );

  return {
    batchItemFailures,
  };
};
