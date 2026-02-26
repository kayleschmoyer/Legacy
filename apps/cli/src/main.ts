import './.startup';
import { Command } from 'commander';
import { logError } from '@legacy-sports/utils';
import { FileOutputDestination, LOGGER } from '@legacy-sports/logging';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
} from '@legacy-sports/sentry';
import { handleLoadPlayers } from './commands/loadPlayers';
import { handleLoadCareerStats } from './commands/loadCareerStats';
import { handleLoadSinglePlayerStats } from './commands/loadSinglePlayerStats';
import { handleLoadGameStats } from './commands/loadGameStats';
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
import { handleTestWorkflow } from './commands/testWorkflow';
import { handleRetryFailedPlayers } from './commands/retryFailedPlayers';
import { handleStatsLoadingStatus } from './commands/statsLoadingStatus';
import { handleTestDraftTimer } from './commands/testDraftTimer';
import { handleLoadWobaWeights } from './commands/loadWobaWeights';
import { handleLoadBrParkFactors } from './commands/loadBrParkFactors';
import { handleLoadPositionalAdjustments } from './commands/loadPositionalAdjustments';

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
    )
    .option(
      '--log-file <path>',
      'Write logs to the specified file (in addition to console)',
    )
    .hook('preAction', (thisCommand) => {
      // Add file destination if --log-file option is provided
      const logFile = thisCommand.opts().logFile as string | undefined;
      if (logFile) {
        LOGGER.addDestination(new FileOutputDestination(logFile));
        LOGGER.info(`📝 Logging to file: ${logFile}`);
      }
    });

  // Simple commands without options
  program.command('load-players').action(handleLoadPlayers);

  program
    .command('load-career-stats')
    .description('Load career stats for players')
    .option('-l, --limit <number>', 'Number of players to process', parseInt)
    .option('--remote', 'Send to SQS queue instead of processing directly')
    .option('--prioritize-new', 'Prioritize players without stats')
    .option('--show-summary', 'Show stats refresh summary before loading')
    .action(
      (options: {
        limit?: number;
        remote?: boolean;
        prioritizeNew?: boolean;
        showSummary?: boolean;
      }) =>
        handleLoadCareerStats({
          limit: options.limit,
          remote: options.remote ?? false,
          'prioritize-new': options.prioritizeNew ?? false,
          'show-summary': options.showSummary ?? false,
        }),
    );

  program
    .command('load-single-player-stats')
    .description('Load career stats for a specific player')
    .option('-p, --player <bref_id>', 'Player Baseball Reference ID (bref_id)')
    .option('--remote', 'Send to SQS queue instead of processing directly')
    .action(handleLoadSinglePlayerStats);

  program
    .command('load-game-stats')
    .description('Load game-level stats for a specific player and season')
    .option('-p, --player <bref_id>', 'Player Baseball Reference ID (bref_id)')
    .option('-s, --season <year>', 'Season year', parseInt)
    .option(
      '--position <pos>',
      'Fielding position (optional, use null to test null handling)',
    )
    .action(
      (options: { player?: string; season?: number; position?: string }) => {
        if (!options.player || !options.season) {
          LOGGER.error('Both --player and --season are required');
          process.exit(1);
        }
        return handleLoadGameStats({
          player: options.player,
          season: options.season,
          position: options.position,
        });
      },
    );

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
      'Obtain a JWT via device flow authentication and output it in the requested format',
    )
    .option(
      '-f, --format <format>',
      'Output format: token (default), header, env, localstorage',
      'token',
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

  program
    .command('test-workflow')
    .description(
      'Run end-to-end workflow test: create league → draft → create matchups → trigger game selection',
    )
    .option('--user <email>', 'User email to run as (defaults to current user)')
    .option(
      '--skip-cleanup',
      'Keep the test league after completion for inspection',
    )
    .option(
      '--teams <number>',
      'Number of teams to create in the league (default: 4)',
      parseInt,
    )
    .option(
      '--weeks <number>',
      'Number of weeks to create and process (default: 1)',
      parseInt,
    )
    .option(
      '--final-week-games <number>',
      'Number of games to trigger in the final week (default: all games)',
      parseInt,
    )
    .action(
      (options: {
        user?: string;
        skipCleanup?: boolean;
        teams?: number;
        weeks?: number;
        finalWeekGames?: number;
      }) => handleTestWorkflow(options),
    );

  program
    .command('stats-loading-status')
    .description(
      'Show progress of player game stats loading across leagues and matchups',
    )
    .option('-l, --league <id>', 'Filter by league ID', parseInt)
    .option('-m, --matchup <id>', 'Filter by matchup ID', parseInt)
    .option('-w, --watch', 'Auto-refresh on an interval')
    .option(
      '-i, --interval <seconds>',
      'Refresh interval in seconds (default: 15)',
      parseInt,
    )
    .action(
      (options: {
        league?: number;
        matchup?: number;
        watch?: boolean;
        interval?: number;
      }) => handleStatsLoadingStatus(options),
    );

  program
    .command('retry-failed-players')
    .description(
      'Re-queue failed player stats for SQS loading. Resets status and sends to stats queue.',
    )
    .option('-l, --league <id>', 'Filter by league ID', parseInt)
    .option('-m, --matchup <id>', 'Filter by matchup ID', parseInt)
    .option('--dry-run', 'Show what would be retried without sending messages')
    .option(
      '--process-dlq',
      'Redrive messages from the dead letter queue back to the main queue',
    )
    .action(
      (options: {
        league?: number;
        matchup?: number;
        dryRun?: boolean;
        processDlq?: boolean;
      }) =>
        handleRetryFailedPlayers({
          leagueId: options.league,
          matchupId: options.matchup,
          dryRun: options.dryRun,
          processDlq: options.processDlq,
        }),
    );

  program
    .command('test-draft-timer')
    .description('Test draft pick deadline timer and auto-pick processing')
    .option('-l, --league-id <id>', 'Target league ID', parseInt)
    .option(
      '-s, --set-deadline <seconds>',
      'Set a short deadline (seconds from now) on the league draft for testing',
      parseInt,
    )
    .option(
      '-p, --process',
      'Process all expired draft deadlines (trigger auto-pick)',
    )
    .option('--status', 'Show current draft timer status')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(
      (options: {
        leagueId?: number;
        setDeadline?: number;
        process?: boolean;
        status?: boolean;
        dryRun?: boolean;
      }) => handleTestDraftTimer(options),
    );

  program
    .command('load-woba-weights')
    .description(
      'Load FanGraphs wOBA season weights (1871-2025) into woba_season_weights table',
    )
    .option('--upsert', 'Overwrite existing rows instead of skipping')
    .action((options: { upsert?: boolean }) => handleLoadWobaWeights(options));

  program
    .command('load-br-park-factors')
    .description(
      'Scrape Baseball Reference BPF/PPF park factors into park_factors table',
    )
    .option('--upsert', 'Overwrite existing rows instead of skipping')
    .option('--from <year>', 'Start year (default: 1876)')
    .option('--to <year>', 'End year (default: 2025)')
    .action((options: { upsert?: boolean; from?: string; to?: string }) =>
      handleLoadBrParkFactors(options),
    );

  program
    .command('load-positional-adjustments')
    .description(
      'Load Baseball Reference year-specific positional adjustments (1871-2025) into positional_adjustments table',
    )
    .option('--upsert', 'Overwrite existing rows instead of skipping')
    .action((options: { upsert?: boolean }) =>
      handleLoadPositionalAdjustments(options),
    );

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
