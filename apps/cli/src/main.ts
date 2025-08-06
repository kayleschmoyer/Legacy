import './.startup';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { logError } from '@legacy-sports/utils';
import { LOGGER } from 'lib/logging/src/lib/logging';
import {
  handleLoadPlayers,
  loadPlayersCommandBuilder,
} from './commands/loadPlayers';
import {
  handleLoadCareerStats,
  loadCareerStatsCommandBuilder,
} from './commands/loadCareerStats';
import {
  computeScoringCommandBuilder,
  handleComputeScoring,
} from './commands/computeScoring';
import {
  runMigrations,
  runMigrationsCommandBuilder,
} from './commands/runMigrations';
import {
  createMatchupCommandBuilder,
  handleCreateMatchup,
} from './commands/createMatchup';
import { handleTestDb, testDbCommandBuilder } from './commands/testDb';

async function run(): Promise<void> {
  await yargs(hideBin(process.argv))
    .option('use-dotenv-file', {
      default: true,
      description: 'Whether to load environment from .env file',
      global: true,
      type: 'boolean',
    })
    .command('load-players', '', loadPlayersCommandBuilder, handleLoadPlayers)
    .command(
      'load-career-stats',
      '',
      loadCareerStatsCommandBuilder,
      handleLoadCareerStats
    )
    .command(
      'compute-scoring',
      '',
      computeScoringCommandBuilder,
      handleComputeScoring
    )
    .command('run-migrations', '', runMigrationsCommandBuilder, runMigrations)
    .command(
      'create-matchup',
      'Creates the matchup records for players in the matchup',
      createMatchupCommandBuilder,
      handleCreateMatchup
    )
    .command(
      'test-db',
      'Tests database connectivity',
      testDbCommandBuilder,
      handleTestDb
    )
    .demandCommand()
    .help()
    .parse();
}

LOGGER.info('Starting CLI application...');

run()
  .then((result) => {
    LOGGER.info('CLI application ran successfully', result);
  })
  .catch((err: unknown) => {
    logError(err);
    process.exit(1);
  });
