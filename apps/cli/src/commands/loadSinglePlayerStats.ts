import { loadCareerStats } from '@legacy-sports/data-loaders';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import {
  getPlayerByBrefId,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { EnvironmentVariable } from '../EnvironmentVariable';

interface HandleLoadSinglePlayerStatsArgs {
  player: string;
  remote?: boolean;
}

async function insertIntoSqs(playerId: string): Promise<void> {
  const queueUrl = getEnvVarRequired(EnvironmentVariable.SQS_QUEUE_URL);

  const sqsClient = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(playerId),
    MessageGroupId: 'stats-loading', // Required for FIFO queues
    MessageDeduplicationId: `${playerId}-${Date.now()}`, // Ensure uniqueness
  });

  await sqsClient.send(command);
}

export async function handleLoadSinglePlayerStats(
  args: HandleLoadSinglePlayerStatsArgs,
): Promise<void> {
  LOGGER.debug(`Loading Player Stats for ${args.player}`);

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // Verify player exists
    const player = await getPlayerByBrefId(db, args.player);

    if (!player) {
      const errorMsg = `Player with brefId "${args.player}" not found in database`;
      LOGGER.error(errorMsg);
      throw new Error(errorMsg);
    }

    LOGGER.info(
      `Loading Player ${player.brefId} (${player.firstName} ${player.lastName})`,
    );

    try {
      if (args.remote) {
        await insertIntoSqs(player.brefId);
        LOGGER.info(
          `Successfully added ${player.brefId} to SQS queue for processing`,
        );
      } else {
        await loadCareerStats(db, player.brefId);
        LOGGER.info(`Successfully loaded career stats for ${player.brefId}`);
      }
    } catch (err) {
      LOGGER.error(`Error processing player ${player.brefId}: ${String(err)}`);
      throw err;
    }
  });
}
