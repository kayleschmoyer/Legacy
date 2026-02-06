import './.startup';
import { Command } from 'commander';
import { logError } from '@legacy-sports/utils';
import { LOGGER } from 'lib/logging/src/lib/logging';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
} from '@legacy-sports/sentry';
import { handleLoadPlayers } from './commands/loadPlayers';
import { handleLoadCareerStats } from './commands/loadCareerStats';
import { handleLoadSinglePlayerStats } from './commands/loadSinglePlayerStats';
import { handleCheckStatsStatus } from './commands/checkStatsStatus';
import { handleListPlayers } from './commands/listPlayers';
import { handleTestAddPlayer } from './commands/testAddPlayer';
import { handleTestConnection } from './commands/testConnection';
import { handleComputeScoring } from './commands/computeScoring';
import { handleRunMigrations } from './commands/runMigrations';
import { inspectDatabase } from './commands/inspectDatabase';
import { handleResetDatabase } from './commands/resetDatabase';
import { fixUsersTable } from './commands/fixUsersTable';
import { testInternal } from './commands/testInternal';
import { handleCreateMatchup } from './commands/createMatchup';
import { handleTestDb } from './commands/testDb';
import { handleTestRawConnection } from './commands/testRawConnection';
import { handleDecodeJwt } from './commands/decodeJwt';
import { handleSetUserType } from './commands/setUserType';
import { handleListUsers } from './commands/listUsers';
import { handleAddUser } from './commands/addUser';
import { handleAuth } from './commands/auth';
import { handleAuthenticatedListUsers } from './commands/authenticatedListUsers';
import { handleGraphQLTest } from './commands/graphqlTest';
import { handleGenerateJwt } from './commands/generateJwt';
import { handleInspectSqsQueue } from './commands/inspectSqsQueue';
import { handleStartDraft } from './commands/startDraft';
import { investigateLeague13 } from './commands/investigateLeague13';
import { handleInvestigateMatchup } from './commands/investigateMatchup';
import { handleFindMatchupFromPlayer } from './commands/findMatchupFromPlayer';
import { handleGetLeagueSeasons } from './commands/getLeagueSeasons';
import { handleQueryDb } from './commands/queryDb';
import { handleGetPlayerBatting } from './commands/getPlayerBatting';
import { handleGetPlayerPitching } from './commands/getPlayerPitching';
import { handleGetPlayerFielding } from './commands/getPlayerFielding';
import { handleTriggerGameSelection } from './commands/triggerGameSelection';

// Initialize Sentry for CLI
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
  LOGGER.info('Sentry initialized for CLI');
}

async function run(): Promise<void> {
  const program = new Command();

  program
    .name('legacy-sports-cli')
    .description('CLI tool for Legacy Sports database and API operations')
    .option(
      '--use-dotenv-file',
      'Whether to load environment from .env file',
      true,
    );

  // Simple commands without options
  program.command('load-players').action(handleLoadPlayers);
  program.command('load-career-stats').action(handleLoadCareerStats);

  program
    .command('load-single-player-stats')
    .description('Load career stats for a specific player')
    .action(handleLoadSinglePlayerStats);

  program
    .command('check-stats-status')
    .description('Check the status of season stats loading')
    .action(handleCheckStatsStatus);

  program
    .command('list-players')
    .description('List players from the database')
    .action(handleListPlayers);

  program
    .command('test-add-player')
    .description('Test adding a player to the database')
    .action(handleTestAddPlayer);

  program
    .command('test-connection')
    .description('Test database connection and environment variables')
    .action(handleTestConnection);

  program.command('compute-scoring').action(handleComputeScoring);

  program
    .command('run-migrations')
    .description('Run database migrations (new system)')
    .action(handleRunMigrations);

  program
    .command('inspect-database')
    .description('Inspect current database state and migration status')
    .action(inspectDatabase);

  // query-db command with options
  program
    .command('query-db')
    .description('Execute a SQL query against the database')
    .option('-q, --query <query>', 'SQL query to execute')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .action((options: { query?: string; format?: string }) =>
      handleQueryDb(options as { query: string; format: string }),
    );

  program
    .command('reset-database')
    .description(
      'Reset database by dropping all tables and schemas (DESTRUCTIVE)',
    )
    .action(handleResetDatabase);

  program
    .command('create-matchup')
    .description('Creates the matchup records for players in the matchup')
    .action(handleCreateMatchup);

  program
    .command('test-db')
    .description('Tests database connectivity')
    .action(handleTestDb);

  program
    .command('test-raw-connection')
    .description('Test raw PostgreSQL connection using pg package')
    .action(handleTestRawConnection);

  program
    .command('fix-users-table')
    .description('Create missing app_internal.users table')
    .action(fixUsersTable);

  program
    .command('test-internal')
    .description('Test internal schema state')
    .action(testInternal);

  program
    .command('decode-jwt')
    .description('Decode and analyze a JWT token')
    .action(handleDecodeJwt);

  program
    .command('set-user-type')
    .description('Set the access level for a user by email address')
    .action(handleSetUserType);

  program
    .command('list-users')
    .description('List existing users with their IDs and email addresses')
    .action(handleListUsers);

  program
    .command('add-user')
    .description(
      'Add a new user to the database (required for OAuth authentication)',
    )
    .action(handleAddUser);

  // auth command with positional argument
  program
    .command('auth <action>')
    .description(
      'Manage CLI authentication (login, logout, status, switch, list)',
    )
    .option('-u, --user <email>', 'Specific user email to target')
    .option('-a, --all', 'Apply action to all users (logout only)', false)
    .action(
      (
        action: 'login' | 'logout' | 'status' | 'switch' | 'list',
        options: { user?: string; all?: boolean },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      ) => handleAuth({ action, user: options.user, all: options.all } as any),
    );

  program
    .command('list-users-auth')
    .description(
      'List users using authenticated GraphQL API (demo of auth system)',
    )
    .action(handleAuthenticatedListUsers);

  program
    .command('graphql-test')
    .description('Execute arbitrary GraphQL queries with authentication')
    .action(handleGraphQLTest);

  program
    .command('generate-jwt')
    .description(
      'Generate a JWT token for a specific user (development/testing)',
    )
    .action(handleGenerateJwt);

  program
    .command('inspect-sqs-queue')
    .description('Inspect and manage the SQS draft queue')
    .action(handleInspectSqsQueue);

  program
    .command('start-draft')
    .description('Start a draft for a specific league')
    .action(handleStartDraft);

  program
    .command('investigate-league-13')
    .description(
      'Investigate why league 13 players have stats_last_fetched_at but no season_batting',
    )
    .action(investigateLeague13);

  // investigate-matchup with positional argument
  program
    .command('investigate-matchup <matchupId>')
    .description('Investigate why a matchup has null game numbers')
    .action((matchupId: string) =>
      handleInvestigateMatchup({ matchupId: Number(matchupId) }),
    );

  // find-matchup-from-player with positional argument
  program
    .command('find-matchup-from-player <matchupPlayerId>')
    .description('Find matchup ID from matchup player ID')
    .action((matchupPlayerId: string) =>
      handleFindMatchupFromPlayer({ matchupPlayerId: Number(matchupPlayerId) }),
    );

  // get-league-seasons with positional argument
  program
    .command('get-league-seasons <leagueId>')
    .description('Get available seasons with stats for a league')
    .action((leagueId: string) =>
      handleGetLeagueSeasons({ leagueId: Number(leagueId) }),
    );

  // get-player-batting with options
  program
    .command('get-player-batting')
    .description('Get batting stats for a player by bref_id')
    .option('-p, --player <bref_id>', 'Player Baseball Reference ID (bref_id)')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option(
      '-l, --limit <number>',
      'Maximum number of seasons to return',
      parseInt,
    )
    .action((options: { player?: string; format?: string; limit?: number }) =>
      handleGetPlayerBatting(options),
    );

  // get-player-pitching with options
  program
    .command('get-player-pitching')
    .description('Get pitching stats for a player by bref_id')
    .option('-p, --player <bref_id>', 'Player Baseball Reference ID (bref_id)')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option(
      '-l, --limit <number>',
      'Maximum number of seasons to return',
      parseInt,
    )
    .action((options: { player?: string; format?: string; limit?: number }) =>
      handleGetPlayerPitching(options),
    );

  // get-player-fielding with options
  program
    .command('get-player-fielding')
    .description('Get fielding stats for a player by bref_id')
    .option('-p, --player <bref_id>', 'Player Baseball Reference ID (bref_id)')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option(
      '-l, --limit <number>',
      'Maximum number of seasons to return',
      parseInt,
    )
    .action(
      (options: {
        player?: string;
        format?: string;
        limit?: number;
        position?: string;
      }) => handleGetPlayerFielding(options),
    );

  program
    .command('trigger-game-selection')
    .description('Trigger game selection to queue pending stats loading')
    .action(handleTriggerGameSelection);

  await program.parseAsync(process.argv);
}

LOGGER.info('Starting CLI application...');

run()
  .then(() => {
    LOGGER.info('CLI application ran successfully');
  })
  .catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(error);
    captureError(error, { context: 'cli-application' });
    process.exit(1);
  });
