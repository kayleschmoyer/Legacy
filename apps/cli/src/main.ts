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
  handleLoadSinglePlayerStats,
  loadSinglePlayerStatsCommandBuilder,
} from './commands/loadSinglePlayerStats';
import {
  handleListPlayers,
  listPlayersCommandBuilder,
} from './commands/listPlayers';
import {
  handleTestAddPlayer,
  testAddPlayerCommandBuilder,
} from './commands/testAddPlayer';
import {
  handleTestConnection,
  testConnectionCommandBuilder,
} from './commands/testConnection';
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
import {
  handleTestRawConnection,
  testRawConnectionCommandBuilder,
} from './commands/testRawConnection';
import { main as testDatabase } from './commands/test-database';

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
      'load-single-player-stats',
      'Load career stats for a specific player',
      loadSinglePlayerStatsCommandBuilder,
      handleLoadSinglePlayerStats
    )
    .command(
      'list-players',
      'List players from the database',
      listPlayersCommandBuilder,
      handleListPlayers
    )
    .command(
      'test-add-player',
      'Test adding a player to the database',
      testAddPlayerCommandBuilder,
      handleTestAddPlayer
    )
    .command(
      'test-connection',
      'Test database connection and environment variables',
      testConnectionCommandBuilder,
      handleTestConnection
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
    .command(
      'test-raw-connection',
      'Test raw PostgreSQL connection using pg package',
      testRawConnectionCommandBuilder,
      handleTestRawConnection
    )
    .command(
      'test-database',
      'Test new database service layer',
      {},
      async () => {
        await testDatabase();
      }
    )
    .demandCommand()
    .help()
    .parse();
}

LOGGER.info('Starting CLI application...');

run()
  .then(() => {
    LOGGER.info('CLI application ran successfully');
  })
  .catch((err: unknown) => {
    logError(err);
    process.exit(1);
  });
