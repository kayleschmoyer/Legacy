import { Argv } from 'yargs';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import {
  getPlayersOnTeams,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { EnvironmentVariable } from '../EnvironmentVariable';

export const loadCareerStatsCommandBuilder = (argv: Argv) =>
  argv
    .usage('load-career-stats')
    .option('remote', {
      default: false,
      type: 'boolean',
    })
    .demandOption('remote');

type ArgsType<T> = T extends Argv<infer P> ? P : never;

async function insertIntoSqs(playerId: string): Promise<void> {
  const queueUrl = getEnvVarRequired(EnvironmentVariable.SQS_QUEUE_URL);

  const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(playerId),
    MessageGroupId: 'stats-loading', // Required for FIFO queues
    MessageDeduplicationId: `${playerId}-${Date.now()}`, // Ensure uniqueness
  });

  await sqsClient.send(command);
}

type HandleLoadCareerStatsArgs = ArgsType<
  ReturnType<typeof loadCareerStatsCommandBuilder>
>;

export async function handleLoadCareerStats(
  args: HandleLoadCareerStatsArgs
): Promise<void> {
  LOGGER.debug('Loading Player Stats');

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    const players = await getPlayersOnTeams(db);

    const errors: unknown[] = [];

    for (const player of players) {
      LOGGER.info(`Loading Player ${player.brefId}`);
      try {
        if (args.remote) {
          await insertIntoSqs(player.brefId);
        } else {
          await loadCareerStats(db, player.brefId);
        }
      } catch (err) {
        LOGGER.error(String(err));
        errors.push(err);
      }
    }

    LOGGER.info(`Created ${players.length} players`);
    LOGGER.error(`Errors encountered: ${JSON.stringify(errors)}`);
  });
}
