import { Argv } from 'yargs';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import axios from 'axios';
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
  const sqsHost = getEnvVarRequired(EnvironmentVariable.LOAD_STATS_SQS_HOST);

  await axios.post(sqsHost, { playerId: playerId });
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

    const errors = [];

    for (const player of players) {
      LOGGER.info(`Loading Player ${player.brefId}`);
      try {
        if (args.remote) {
          await insertIntoSqs(player.brefId);
        } else {
          await loadCareerStats(db, player.brefId);
        }
      } catch (err) {
        LOGGER.error(err);
        errors.push(err);
      }
    }

    LOGGER.info(`Created ${players.length} players`);
    LOGGER.error(errors);
  });
}
