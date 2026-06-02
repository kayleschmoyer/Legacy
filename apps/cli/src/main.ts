import './.startup';
import { Command, InvalidArgumentError } from 'commander';
import { logError } from '@legacy-sports/utils';
import { FileOutputDestination, LOGGER } from '@legacy-sports/logging/server';
import {
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar';
import { handleLoadPlayers } from './commands/loadPlayers';
import { handleLoadCareerStats } from './commands/loadCareerStats';
import { handleSeedDevData } from './commands/seedDevData';
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
import { handleUnblockLeague, parseLeagueId } from './commands/unblockLeague';
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
import { handleQueuePlayers, parseSport, Sport } from './commands/queuePlayers';
import { handleStatsLoadingStatus } from './commands/statsLoadingStatus';
import { handleTestDraftTimer } from './commands/testDraftTimer';
import { handleLoadWobaWeights } from './commands/loadWobaWeights';
import { handleLoadBrParkFactors } from './commands/loadBrParkFactors';
import { handleLoadPositionalAdjustments } from './commands/loadPositionalAdjustments';
import { handleLoadOnThisDayEvents } from './commands/loadOnThisDayEvents';
import { handleCleanupTestLeagues } from './commands/cleanupTestLeagues';
import { handleCleanupTestUsers } from './commands/cleanupTestUsers';
import { handleDeleteLeague } from './commands/deleteLeague';
import { handleReportToJiraEpic } from './commands/reportToJiraEpic';
import { handleSeedDisclosureFacts } from './commands/seedDisclosureFacts';
import { handleSeedStripe } from './commands/seedStripe';
import { handleLoadFootballCareer } from './commands/loadFootballCareer';
import { handleGetPlayerFootballPassing } from './commands/getPlayerFootballPassing';
import { handleGetPlayerFootballRushing } from './commands/getPlayerFootballRushing';
import { handleGetPlayerFootballReceiving } from './commands/getPlayerFootballReceiving';
import { handleGetPlayerFootballKicking } from './commands/getPlayerFootballKicking';
import { handleGetPlayerFootballDefense } from './commands/getPlayerFootballDefense';

// Initialize Rollbar for CLI
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
  LOGGER.info('Rollbar initialized for CLI');
}

export function buildProgram(): Command {
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
    .command('seed-dev-data')
    .description(
      'Seed the local dev database with a subset of players and their career stats. ' +
        'Fetches player lists from Baseball Reference for the given letters, upserts them, ' +
        'then loads career stats for the first N players.',
    )
    .option(
      '--letters <a,b,...>',
      'Comma-separated letters to pull players from (default: a,b)',
    )
    .option(
      '--stats-limit <number>',
      'Number of players to load career stats for (default: 25)',
      parseInt,
    )
    .option('--skip-stats', 'Insert players only — skip stats loading')
    .option(
      '--skip-players',
      'Load stats for existing players only — skip player insert',
    )
    .action(
      (options: {
        letters?: string;
        statsLimit?: number;
        skipStats?: boolean;
        skipPlayers?: boolean;
      }) => handleSeedDevData(options),
    );

  program
    .command('load-career-stats')
    .description('Load career stats for players')
    .option('-l, --limit <number>', 'Number of players to process', parseInt)
    .option('--remote', 'Send to SQS queue instead of processing directly')
    .option('--prioritize-new', 'Prioritize players without stats')
    .option('--show-summary', 'Show stats refresh summary before loading')
    .option('-q, --quiet', 'Suppress debug/info logs (only warn/error)')
    .action(
      (options: {
        limit?: number;
        remote?: boolean;
        prioritizeNew?: boolean;
        showSummary?: boolean;
        quiet?: boolean;
      }) =>
        handleLoadCareerStats({
          limit: options.limit,
          remote: options.remote ?? false,
          'prioritize-new': options.prioritizeNew ?? false,
          'show-summary': options.showSummary ?? false,
          quiet: options.quiet ?? false,
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
    .option('--confirm', 'Confirm destructive reset', false)
    .option(
      '--db-name <name>',
      'Name of the connected database; must match the resolved database to proceed',
    )
    .action((options: { confirm?: boolean; dbName?: string }) =>
      handleResetDatabase(options),
    );

  program
    .command('create-matchup')
    .description('Creates the matchup records for players in the matchup')
    .action(handleCreateMatchup);

  program
    .command('unblock-league')
    .description(
      'Create all matchups for a stuck league (calls createAllMatchupsForLeague). ' +
        'Use when a draft completed but matchups were never generated.',
    )
    .requiredOption('--id <leagueId>', 'League ID to unblock', parseLeagueId)
    .action((options: { id: number }) => handleUnblockLeague(options));

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
    .requiredOption('-t, --token <jwt>', 'JWT token to decode')
    .option('--pretty', 'Pretty-print the decoded payload', false)
    .action((options: { token: string; pretty?: boolean }) =>
      handleDecodeJwt(options),
    );

  program
    .command('set-user-type')
    .description('Set the access level for a user by email address')
    .option('--email <email>', 'Email address of the user to update')
    .option('--type <type>', 'Access level to set (none or admin)')
    .action(handleSetUserType);

  program
    .command('list-users')
    .description('List existing users with their IDs and email addresses')
    .action(handleListUsers);

  const parseAccessLevel = (value: string): 'none' | 'admin' => {
    if (value !== 'none' && value !== 'admin') {
      throw new InvalidArgumentError(
        `Access level must be 'none' or 'admin', got '${value}'`,
      );
    }
    return value;
  };

  program
    .command('add-user')
    .description(
      'Add a new user to the database (required for OAuth authentication)',
    )
    .requiredOption('--email <email>', 'User email address')
    .option(
      '--access-level <level>',
      'Access level (none|admin)',
      parseAccessLevel,
      'none',
    )
    .action((options: { email: string; accessLevel?: 'none' | 'admin' }) =>
      handleAddUser(options),
    );

  // auth command with positional argument
  program
    .command('auth <action>')
    .description(
      'Manage CLI authentication (login, logout, status, switch, list)',
    )
    .option('-u, --user <email>', 'Specific user email to target')
    .option('-a, --all', 'Apply action to all users (logout only)', false)
    .option(
      '--no-db-tunnel',
      'Skip the DB tunnel after login (default: opens an SSM port-forwarding tunnel to RDS)',
    )
    .option(
      '--local-port <port>',
      'Local port for the DB tunnel (default: 5432)',
      (v: string) => Number.parseInt(v, 10),
    )
    .option(
      '--profile <name>',
      'AWS CLI profile to use (e.g. legacy-sports-dev)',
    )
    .action(
      // Commander types callback params as `any`; suppress the resulting
      // no-unsafe-argument lint error (same pattern used by other handlers).
      (
        action: 'login' | 'logout' | 'status' | 'switch' | 'list',
        options: {
          user?: string;
          all?: boolean;
          dbTunnel?: boolean;
          localPort?: number;
          profile?: string;
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      ) => handleAuth({ action, ...options } as any),
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
      'Obtain a JWT via device flow authentication and print its metadata. ' +
        'By default the raw token is NOT printed — pass --reveal to print it once on stdout. ' +
        '--reveal is incompatible with the global --log-file option.',
    )
    .option(
      '--reveal',
      'Print the raw JWT exactly once on stdout (refuses to run with --log-file)',
      false,
    )
    .action((options: { reveal?: boolean }, command: Command) => {
      const globals: { logFile?: string } = command.optsWithGlobals();
      return handleGenerateJwt({
        reveal: options.reveal ?? false,
        logFile: globals.logFile,
      });
    });

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
    .command('queue-players')
    .description(
      'Discover players for a sport and batch-enqueue them to the stats SQS queue. ' +
        'Baseball reads existing players from the DB; football scrapes the PFR A-Z index, ' +
        'upserts players, then queues them. Queue URLs are read from env, not hardcoded.',
    )
    .requiredOption(
      '--sport <sport>',
      "Sport to queue ('baseball' or 'football')",
      parseSport,
    )
    .option(
      '--letter <letter>',
      'Process only players whose ID starts with this letter (for testing)',
    )
    .action((options: { sport: Sport; letter?: string }) =>
      handleQueuePlayers({ sport: options.sport, letter: options.letter }),
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

  program
    .command('load-on-this-day-events')
    .description(
      'Fetch MLB Stats API transaction records for every calendar day and insert notable events into on_this_day_events table',
    )
    .option('--from <year>', 'Start year (default: 2008)', parseInt)
    .option('--to <year>', 'End year (default: current year)', parseInt)
    .option(
      '--delay <ms>',
      'Milliseconds between API requests (default: 200)',
      parseInt,
    )
    .option('--upsert', 'Overwrite existing rows instead of skipping')
    .action(
      (options: {
        from?: number;
        to?: number;
        delay?: number;
        upsert?: boolean;
      }) => handleLoadOnThisDayEvents(options),
    );

  program
    .command('report-to-jira-epic <report>')
    .description(
      'Fetch a Playwright report and create a Jira epic with one child ticket per failing test. ' +
        '<report> can be a report name (nightly-12345, pr-42, manual-7) or a full GitHub Pages URL. ' +
        'Requires JIRA_BASE_URL (or JIRA_SITE_URL / JIRA_HOST), JIRA_EMAIL, and JIRA_API_TOKEN env vars unless --dry-run is used.',
    )
    .option(
      '-p, --project <key>',
      'Jira project key (default: JIRA_PROJECT_KEY env var or LS)',
    )
    .option('--epic-summary <text>', 'Override the auto-generated epic summary')
    .option(
      '--issue-type <type>',
      'Issue type for child tickets (default: Bug)',
      'Bug',
    )
    .option('--dry-run', 'Preview what would be created without calling Jira')
    .action(
      (
        report: string,
        options: {
          project?: string;
          epicSummary?: string;
          issueType?: string;
          dryRun?: boolean;
        },
      ) =>
        handleReportToJiraEpic({
          report,
          project: options.project ?? process.env['JIRA_PROJECT_KEY'] ?? 'LS',
          issueType: options.issueType ?? 'Bug',
          epicSummary: options.epicSummary,
          dryRun: options.dryRun,
        }),
    );

  program
    .command('seed-disclosure-facts')
    .description(
      'Populate the player_facts table from existing player and stats data. ' +
        'Required before the Who Am I? game (/games/disclosure) can start sessions. ' +
        'The seed is idempotent — safe to re-run.',
    )
    .action(() => handleSeedDisclosureFacts());

  program
    .command('seed-stripe')
    .description(
      'Idempotently seed Stripe test-mode features, product, and prices from ' +
        'the workspace entitlement constants. Refuses to run against a live-mode ' +
        '(sk_live_) key. Requires STRIPE_SECRET_KEY (sk_test_...). ' +
        'Prints the monthly/annual price IDs on success. Safe to re-run.',
    )
    .action(() => handleSeedStripe());

  program
    .command('load-football-career')
    .description(
      'Load career stats from Pro Football Reference into career_football_* tables. ' +
        'Accepts --player-id for a single player, --all for all football players, ' +
        'or --batch <file> for a newline-delimited list of player IDs.',
    )
    .option(
      '--player-id <id>',
      'Load career stats for a single player ID',
      parseInt,
    )
    .option('--all', 'Load career stats for all football players')
    .option(
      '--batch <file>',
      'Load career stats for player IDs listed in a file (one per line)',
    )
    .option(
      '--start-season <year>',
      'Override start year for PFR season scan (default: 1970)',
      parseInt,
    )
    .action(
      (options: {
        playerId?: number;
        all?: boolean;
        batch?: string;
        startSeason?: number;
      }) =>
        handleLoadFootballCareer({
          playerId: options.playerId,
          all: options.all,
          batch: options.batch,
          startSeason: options.startSeason,
        }),
    );

  program
    .command('get-player-passing')
    .description(
      'Print career passing stats (career_football_passing) for a football player',
    )
    .option('--player-id <id>', 'Player ID', parseInt)
    .action((options: { playerId?: number }) =>
      handleGetPlayerFootballPassing(options),
    );

  program
    .command('get-player-rushing')
    .description(
      'Print career rushing stats (career_football_rushing) for a football player',
    )
    .option('--player-id <id>', 'Player ID', parseInt)
    .action((options: { playerId?: number }) =>
      handleGetPlayerFootballRushing(options),
    );

  program
    .command('get-player-receiving')
    .description(
      'Print career receiving stats (career_football_receiving) for a football player',
    )
    .option('--player-id <id>', 'Player ID', parseInt)
    .action((options: { playerId?: number }) =>
      handleGetPlayerFootballReceiving(options),
    );

  program
    .command('get-player-kicking')
    .description(
      'Print career kicking stats (career_football_kicking) for a football player',
    )
    .option('--player-id <id>', 'Player ID', parseInt)
    .action((options: { playerId?: number }) =>
      handleGetPlayerFootballKicking(options),
    );

  program
    .command('get-player-defense')
    .description(
      'Print career defense stats (career_football_defense or career_football_defense_idp) for a football player',
    )
    .option('--player-id <id>', 'Player ID', parseInt)
    .action((options: { playerId?: number }) =>
      handleGetPlayerFootballDefense(options),
    );

  program
    .command('cleanup-test-leagues')
    .description(
      'Bulk-delete test leagues created by e2e/integration tests and the CLI test-workflow command',
    )
    .option('--dry-run', 'List matching leagues without deleting them')
    .option('--all', 'Target ALL leagues (not just test-named ones)')
    .option(
      '--pattern <regex>',
      'Custom regex to match league names (overrides default test patterns)',
    )
    .option('--yes', 'Skip confirmation prompt and proceed with deletion')
    .action(
      (options: {
        dryRun?: boolean;
        all?: boolean;
        pattern?: string;
        yes?: boolean;
      }) => handleCleanupTestLeagues(options),
    );

  program
    .command('cleanup-test-users')
    .description(
      'Admin only: delete leaked int-*@test.legacysports.dev test users (LS-4917)',
    )
    .option('--dry-run', 'List matching users without deleting them')
    .option(
      '--min-age-days <n>',
      'Only target users older than N days (default 7)',
      parseInt,
    )
    .option('--yes', 'Skip confirmation prompt and proceed with deletion')
    .action(
      (options: { dryRun?: boolean; minAgeDays?: number; yes?: boolean }) =>
        handleCleanupTestUsers(options),
    );

  program
    .command('delete-league')
    .description(
      'Permanently delete a league and ALL related data via CASCADE (DESTRUCTIVE)',
    )
    .requiredOption('--id <leagueId>', 'ID of the league to delete', Number)
    .option('--yes', 'Skip confirmation prompt and proceed with deletion')
    .action((options: { id?: number; yes?: boolean }) =>
      handleDeleteLeague(options),
    );

  return program;
}

async function run(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

if (require.main === module) {
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
}
