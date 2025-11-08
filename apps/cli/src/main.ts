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
  handleRunMigrations,
  runMigrationsCommandBuilder,
} from './commands/runMigrations';
import {
  inspectDatabase,
  inspectDatabaseCommandBuilder,
} from './commands/inspectDatabase';
import {
  handleResetDatabase,
  resetDatabaseCommandBuilder,
} from './commands/resetDatabase';

import {
  fixUsersTable,
  fixUsersTableCommandBuilder,
} from './commands/fixUsersTable';
import {
  testInternal,
  testInternalCommandBuilder,
} from './commands/testInternal';
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
import { decodeJwtCommandBuilder, handleDecodeJwt } from './commands/decodeJwt';
import {
  handleSetUserType,
  setUserTypeCommandBuilder,
} from './commands/setUserType';
import { handleListUsers, listUsersCommandBuilder } from './commands/listUsers';
import { addUserCommandBuilder, handleAddUser } from './commands/addUser';
import { authCommandBuilder, handleAuth } from './commands/auth';
import {
  authenticatedListUsersCommandBuilder,
  handleAuthenticatedListUsers,
} from './commands/authenticatedListUsers';
import {
  graphqlTestCommandBuilder,
  handleGraphQLTest,
} from './commands/graphqlTest';
import {
  generateJwtCommandBuilder,
  handleGenerateJwt,
} from './commands/generateJwt';
import {
  handleInspectSqsQueue,
  inspectSqsQueueCommandBuilder,
} from './commands/inspectSqsQueue';
import {
  handleStartDraft,
  startDraftCommandBuilder,
} from './commands/startDraft';

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
      handleLoadCareerStats,
    )
    .command(
      'load-single-player-stats',
      'Load career stats for a specific player',
      loadSinglePlayerStatsCommandBuilder,
      handleLoadSinglePlayerStats,
    )
    .command(
      'list-players',
      'List players from the database',
      listPlayersCommandBuilder,
      handleListPlayers,
    )
    .command(
      'test-add-player',
      'Test adding a player to the database',
      testAddPlayerCommandBuilder,
      handleTestAddPlayer,
    )
    .command(
      'test-connection',
      'Test database connection and environment variables',
      testConnectionCommandBuilder,
      handleTestConnection,
    )
    .command(
      'compute-scoring',
      '',
      computeScoringCommandBuilder,
      handleComputeScoring,
    )
    .command(
      'run-migrations',
      'Run database migrations (new system)',
      runMigrationsCommandBuilder,
      handleRunMigrations,
    )
    .command(
      'inspect-database',
      'Inspect current database state and migration status',
      inspectDatabaseCommandBuilder,
      inspectDatabase,
    )
    .command(
      'reset-database',
      'Reset database by dropping all tables and schemas (DESTRUCTIVE)',
      resetDatabaseCommandBuilder,
      handleResetDatabase,
    )
    .command(
      'create-matchup',
      'Creates the matchup records for players in the matchup',
      createMatchupCommandBuilder,
      handleCreateMatchup,
    )
    .command(
      'test-db',
      'Tests database connectivity',
      testDbCommandBuilder,
      handleTestDb,
    )
    .command(
      'test-raw-connection',
      'Test raw PostgreSQL connection using pg package',
      testRawConnectionCommandBuilder,
      handleTestRawConnection,
    )
    .command(
      'test-database',
      'Test new database service layer',
      {},
      async () => {
        await testDatabase();
      },
    )
    .command(
      'fix-users-table',
      'Create missing app_internal.users table',
      fixUsersTableCommandBuilder,
      fixUsersTable,
    )
    .command(
      'test-internal',
      'Test internal schema state',
      testInternalCommandBuilder,
      testInternal,
    )
    .command(
      'decode-jwt',
      'Decode and analyze a JWT token',
      decodeJwtCommandBuilder,
      handleDecodeJwt,
    )
    .command(
      'set-user-type',
      'Set the access level for a user by email address',
      setUserTypeCommandBuilder,
      handleSetUserType,
    )
    .command(
      'list-users',
      'List existing users with their IDs and email addresses',
      listUsersCommandBuilder,
      handleListUsers,
    )
    .command(
      'add-user',
      'Add a new user to the database (required for OAuth authentication)',
      addUserCommandBuilder,
      handleAddUser,
    )
    .command(
      'auth <action>',
      'Manage CLI authentication (login, logout, status, switch, list)',
      authCommandBuilder,
      handleAuth,
    )
    .command(
      'list-users-auth',
      'List users using authenticated GraphQL API (demo of auth system)',
      authenticatedListUsersCommandBuilder,
      handleAuthenticatedListUsers,
    )
    .command(
      'graphql-test',
      'Execute arbitrary GraphQL queries with authentication',
      graphqlTestCommandBuilder,
      handleGraphQLTest,
    )
    .command(
      'generate-jwt',
      'Generate a JWT token for a specific user (development/testing)',
      generateJwtCommandBuilder,
      handleGenerateJwt,
    )
    .command(
      'inspect-sqs-queue',
      'Inspect and manage the SQS draft queue',
      inspectSqsQueueCommandBuilder,
      handleInspectSqsQueue,
    )
    .command(
      'start-draft',
      'Start a draft for a specific league',
      startDraftCommandBuilder,
      handleStartDraft,
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
