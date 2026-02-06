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
  checkStatsStatusCommandBuilder,
  handleCheckStatsStatus,
} from './commands/checkStatsStatus';
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
// Removed testDatabase import - not used as a command handler
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
import {
  investigateLeague13,
  investigateLeague13CommandBuilder,
} from './commands/investigateLeague13';
import {
  handleInvestigateMatchup,
  investigateMatchupCommandBuilder,
} from './commands/investigateMatchup';
import {
  findMatchupFromPlayerCommandBuilder,
  handleFindMatchupFromPlayer,
} from './commands/findMatchupFromPlayer';
import {
  getLeagueAvailableSeasonsCommandBuilder,
  handleGetLeagueSeasons,
} from './commands/getLeagueSeasons';
import { handleQueryDb, queryDbCommandBuilder } from './commands/queryDb';
import {
  getPlayerBattingCommandBuilder,
  handleGetPlayerBatting,
} from './commands/getPlayerBatting';
import {
  getPlayerPitchingCommandBuilder,
  handleGetPlayerPitching,
} from './commands/getPlayerPitching';
import {
  getPlayerFieldingCommandBuilder,
  handleGetPlayerFielding,
} from './commands/getPlayerFielding';
import {
  handleTriggerGameSelection,
  triggerGameSelectionCommandBuilder,
} from './commands/triggerGameSelection';

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
      'check-stats-status',
      'Check the status of season stats loading',
      checkStatsStatusCommandBuilder,
      handleCheckStatsStatus,
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
      'query-db',
      'Execute a SQL query against the database',
      queryDbCommandBuilder,
      handleQueryDb,
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
    .command(
      'investigate-league-13',
      'Investigate why league 13 players have stats_last_fetched_at but no season_batting',
      investigateLeague13CommandBuilder,
      investigateLeague13,
    )
    .command(
      'investigate-matchup <matchupId>',
      'Investigate why a matchup has null game numbers',
      investigateMatchupCommandBuilder,
      handleInvestigateMatchup,
    )
    .command(
      'find-matchup-from-player <matchupPlayerId>',
      'Find matchup ID from matchup player ID',
      findMatchupFromPlayerCommandBuilder,
      handleFindMatchupFromPlayer,
    )
    .command(
      'get-league-seasons <leagueId>',
      'Get available seasons with stats for a league',
      getLeagueAvailableSeasonsCommandBuilder,
      handleGetLeagueSeasons,
    )
    .command(
      'get-player-batting',
      'Get batting stats for a player by bref_id',
      getPlayerBattingCommandBuilder,
      handleGetPlayerBatting,
    )
    .command(
      'get-player-pitching',
      'Get pitching stats for a player by bref_id',
      getPlayerPitchingCommandBuilder,
      handleGetPlayerPitching,
    )
    .command(
      'get-player-fielding',
      'Get fielding stats for a player by bref_id',
      getPlayerFieldingCommandBuilder,
      handleGetPlayerFielding,
    )
    .command(
      'trigger-game-selection',
      'Trigger game selection to queue pending stats loading',
      triggerGameSelectionCommandBuilder,
      handleTriggerGameSelection,
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
