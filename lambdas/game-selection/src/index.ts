import {
  APIGatewayEvent,
  APIGatewayProxyResult,
  Context,
  SQSBatchResponse,
  SQSEvent,
} from 'aws-lambda';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import {
  getMissingMatchupRecords,
  PublicSchema,
} from '@legacy-sports/db-client';
import type { PublicDb } from '@legacy-sports/db-client';
import {
  cryptoRandomInt,
  MIN_SEASON_WITH_GAME_DATA,
} from '@legacy-sports/utils';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { handler as selectGameHandler } from './handlers/select-game';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

/**
 * Add CORS headers to API Gateway response
 */
function addCorsHeaders(result: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...result,
    headers: {
      ...result.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
}

/**
 * Handle OPTIONS preflight requests for CORS
 */
function handleOptions(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: '',
  };
}

interface CreateMatchupRequestBody {
  league?: number;
  week?: number;
}

/**
 * Get all matchups for a league/week
 */
async function getMatchupsForLeagueWeek(
  db: PublicDb,
  leagueId: number,
  weekNumber: number,
) {
  return db
    .select()
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNumber),
      ),
    );
}

// Initialize SQS client
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const GAME_STATS_QUEUE_URL = process.env.SQS_LOAD_GAME_STATS_URL;

// Initialize WebSocket notification service
const notificationService = createNotificationService();

/**
 * Queue a matchup stats loading job to SQS
 * Splits large player lists into batches to avoid Lambda timeouts
 * Each batch is processed sequentially within the same matchup group
 */
async function queueMatchupStatsLoad(
  matchupId: number,
  leagueId: number,
  gameRecords: Array<{
    matchupPlayerId: number;
    playerId: number;
    brefId: string;
    season: number;
    fieldingGamePos: string;
  }>,
): Promise<void> {
  if (!GAME_STATS_QUEUE_URL) {
    LOGGER.warn(
      'SQS_LOAD_GAME_STATS_URL not configured, skipping stats loading',
    );
    return;
  }

  // Split players into batches of 8 to avoid Lambda timeouts
  // Each player takes ~10-12 seconds, so 8 players = ~90 seconds (safer timeout margin)
  const BATCH_SIZE = 8;
  const batches: (typeof gameRecords)[] = [];

  for (let i = 0; i < gameRecords.length; i += BATCH_SIZE) {
    batches.push(gameRecords.slice(i, i + BATCH_SIZE));
  }

  LOGGER.info(
    `Queueing ${batches.length} batches for matchup ${matchupId} (${gameRecords.length} total players)`,
  );

  try {
    // Queue all batches sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const message = {
        matchupId,
        players: batch,
        batchIndex,
        totalBatches: batches.length,
      };

      const messageBody = JSON.stringify(message);
      LOGGER.debug('Queueing batch message', {
        matchupId,
        batchIndex,
        totalBatches: batches.length,
        playerCount: batch.length,
        messageBodyPreview: messageBody.substring(0, 200),
      });

      const command = new SendMessageCommand({
        QueueUrl: GAME_STATS_QUEUE_URL,
        MessageBody: messageBody,
        MessageGroupId: `matchup-${matchupId}`, // FIFO queue ensures sequential processing per matchup
        MessageDeduplicationId: `${matchupId}-${batchIndex}`, // Prevent duplicate messages for same matchup/batch
      });

      await sqsClient.send(command);
      LOGGER.debug(
        `Queued batch ${batchIndex + 1}/${batches.length} for matchup ${matchupId} with ${batch.length} players`,
      );

      // Send notification only for the first batch to indicate stats loading has started
      if (batchIndex === 0 && notificationService) {
        try {
          // Send initial loading notification with 0 playerId to indicate matchup-level start
          await notificationService.notifyPlayerStatsLoading(
            0, // playerId = 0 indicates matchup-level start
            matchupId,
            leagueId,
            { loaded: 0, total: gameRecords.length },
          );
          LOGGER.debug(
            `Sent initial stats loading notification for matchup ${matchupId}`,
          );
        } catch (notifyError) {
          LOGGER.warn('Failed to send stats loading notification', {
            error:
              notifyError instanceof Error
                ? notifyError.message
                : String(notifyError),
            matchupId,
          });
        }
      }
    }

    LOGGER.info(
      `Successfully queued all ${batches.length} batches for matchup ${matchupId}`,
    );
  } catch (error) {
    LOGGER.error(`Failed to queue matchup stats loading:`, {
      error: error instanceof Error ? error.message : String(error),
      matchupId,
    });
    // Don't throw - we don't want to fail game selection if queuing fails
  }
}

/**
 * Select a random game for all players in a matchup
 * Delegates to the season-game-selector service which uses real game_identifiers.
 */
async function selectGameForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
): Promise<{
  playersProcessed: number;
  gamesCreated: number;
  gamesRemaining: number;
}> {
  // 1. Get the matchup details
  const matchup = await db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId))
    .limit(1);

  if (!matchup[0]) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const matchupData = matchup[0];
  const gamesPerMatchup = matchupData.gamesPerMatchup || 5;

  // Validate game number
  if (gameNumber < 1 || gameNumber > gamesPerMatchup) {
    throw new Error(
      `Invalid game number ${gameNumber}. Must be between 1 and ${gamesPerMatchup}`,
    );
  }

  LOGGER.info(
    `Selecting game ${gameNumber} of ${gamesPerMatchup} for matchup ${matchupId}`,
  );

  // 2. Count players before selection
  const matchupPlayersCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const totalPlayers = Number(matchupPlayersCount[0]?.count || 0);

  // 3. Delegate to season-game-selector which uses game_identifier-based selection
  const { selectGamesForMatchup: selectGames } =
    await import('./services/season-game-selector');
  const result = await selectGames(db, matchupId, gameNumber);

  // 4. Queue stats loading for uncached players
  if (result.playersNeedingStatsLoading.length > 0) {
    // Look up brefId for each player
    const playerIds = result.playersNeedingStatsLoading.map((p) => p.playerId);
    const playerRecords = await db
      .select({
        id: PublicSchema.players.id,
        brefId: PublicSchema.players.brefId,
      })
      .from(PublicSchema.players)
      .where(inArray(PublicSchema.players.id, playerIds));

    const brefIdMap = new Map(playerRecords.map((p) => [p.id, p.brefId]));

    const gamesToQueue = result.playersNeedingStatsLoading.map((p) => ({
      matchupPlayerId: p.matchupPlayerId,
      playerId: p.playerId,
      brefId: brefIdMap.get(p.playerId) ?? '',
      season: p.season,
      fieldingGamePos: p.fieldingGamePos ?? 'XX',
    }));

    await queueMatchupStatsLoad(matchupId, matchupData.leagueId, gamesToQueue);
  } else if (notificationService) {
    // All stats were cached — stats-lambda won't run, so notify here
    await notificationService.notifyMatchupStatsComplete(
      matchupId,
      matchupData.leagueId,
      totalPlayers,
    );
    LOGGER.info('Sent matchup-stats-complete notification (all stats cached)', {
      matchupId,
      leagueId: matchupData.leagueId,
      totalPlayers,
    });
  }

  // 5. Calculate how many games have been selected so far
  const totalGamesSelected = await db
    .select({
      count: sql<number>`count(distinct ${PublicSchema.matchupPlayerGames.gameNum})`,
    })
    .from(PublicSchema.matchupPlayerGames)
    .innerJoin(
      PublicSchema.matchupPlayers,
      eq(
        PublicSchema.matchupPlayers.id,
        PublicSchema.matchupPlayerGames.matchupPlayerId,
      ),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const gamesSelected = Number(totalGamesSelected[0]?.count || 0);
  const gamesRemaining = gamesPerMatchup - gamesSelected;

  LOGGER.info(
    `Game selection complete for matchup ${matchupId}. ` +
      `Games: ${gamesSelected}/${gamesPerMatchup}, remaining: ${gamesRemaining}. ` +
      `${result.playersNeedingStatsLoading.length} players need stats loading.`,
  );

  return {
    playersProcessed: totalPlayers,
    gamesCreated: totalPlayers - result.playersNeedingStatsLoading.length,
    gamesRemaining,
  };
}

/**
 * Create matchup records for players in a matchup
 */
async function createMatchupForLeagueWeek(
  db: PublicDb,
  league: number,
  week: number,
): Promise<{ playersAdded: number; matchupsProcessed: number }> {
  // Get ALL matchups for this league/week
  const matchups = await getMatchupsForLeagueWeek(db, league, week);

  if (matchups.length === 0) {
    LOGGER.info(`No matchups found for league ${league}, week ${week}`);
    return { playersAdded: 0, matchupsProcessed: 0 };
  }

  LOGGER.info(
    `Found ${matchups.length} matchups for league ${league}, week ${week}`,
  );

  let totalPlayersAdded = 0;
  let matchupsProcessed = 0;

  // Process each matchup
  for (const matchup of matchups) {
    LOGGER.info(
      `Processing matchup ${matchup.id} (Team ${matchup.team1Id} vs Team ${matchup.team2Id})`,
    );

    const missingRecords = await getMissingMatchupRecords(db, matchup.id);

    LOGGER.info(
      `Found ${missingRecords.length} players needing matchup records for matchup ${matchup.id}`,
    );

    // Get matchup league and week for season selection
    if (!matchup.leagueId || !matchup.weekNumber) {
      LOGGER.error(`Matchup ${matchup.id} missing leagueId or weekNumber`);
      throw new Error(`Matchup ${matchup.id} missing leagueId or weekNumber`);
    }

    if (missingRecords.length === 0) {
      LOGGER.info(`No missing records to process for matchup ${matchup.id}`);

      // Even though there are no new records to create, check for existing games with pending stats
      // This handles the case where games were created but never queued for stats loading
      const pendingGames = await db
        .select({
          id: PublicSchema.matchupPlayerGames.id,
          matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
          playerId: PublicSchema.matchupPlayers.playerId,
          brefId: PublicSchema.players.brefId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
          fieldingGamePos: PublicSchema.matchupPlayerGames.fieldingGamePos,
        })
        .from(PublicSchema.matchupPlayerGames)
        .innerJoin(
          PublicSchema.matchupPlayers,
          eq(
            PublicSchema.matchupPlayers.id,
            PublicSchema.matchupPlayerGames.matchupPlayerId,
          ),
        )
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.players.id, PublicSchema.matchupPlayers.playerId),
        )
        .innerJoin(
          PublicSchema.leagueWeekPlayerSeasons,
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              PublicSchema.matchupPlayers.playerId,
            ),
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchup.weekNumber,
            ),
          ),
        )
        .where(
          and(
            eq(PublicSchema.matchupPlayers.matchupId, matchup.id),
            eq(PublicSchema.matchupPlayerGames.statsLoadingStatus, 'pending'),
          ),
        );

      if (pendingGames.length > 0) {
        LOGGER.info(
          `Found ${pendingGames.length} pending games for matchup ${matchup.id}, queuing for stats loading`,
        );

        // Update matchup status to 'loading' and set main status to 'in_progress' if still scheduled
        const updateData: {
          statsLoadingStatus: 'loading';
          status?: 'in_progress';
        } = { statsLoadingStatus: 'loading' };

        if (matchup.status === 'scheduled') {
          updateData.status = 'in_progress';
        }

        await db
          .update(PublicSchema.matchups)
          .set(updateData)
          .where(eq(PublicSchema.matchups.id, matchup.id));
        LOGGER.info(
          `Set matchup ${matchup.id} stats_loading_status to 'loading'${matchup.status === 'scheduled' ? " and status to 'in_progress'" : ''}`,
        );

        // Update individual player game statuses to 'loading'
        const gameIds = pendingGames.map((g) => g.id);
        await db
          .update(PublicSchema.matchupPlayerGames)
          .set({ statsLoadingStatus: 'loading' })
          .where(inArray(PublicSchema.matchupPlayerGames.id, gameIds));
        LOGGER.info(`Set ${gameIds.length} player games to 'loading' status`);

        // Queue all games that need stats
        const gamesToQueue = pendingGames.map((game) => ({
          matchupPlayerId: game.matchupPlayerId,
          playerId: game.playerId,
          brefId: game.brefId || '',
          season: game.season,
          fieldingGamePos: game.fieldingGamePos || 'XX',
        }));

        await queueMatchupStatsLoad(matchup.id, matchup.leagueId, gamesToQueue);
        LOGGER.info(`Queued ${gamesToQueue.length} games for stats loading`);
      }

      matchupsProcessed++;
      continue;
    }

    const playerIds = missingRecords.map((p) => p.id);

    // BATCH 0: Fetch team_id for each player in this league
    LOGGER.info(
      `Batch fetching team assignments for ${playerIds.length} players`,
    );
    const teamAssignments = await db
      .select({
        playerId: PublicSchema.teamMembers.playerId,
        teamId: PublicSchema.teamMembers.teamId,
      })
      .from(PublicSchema.teamMembers)
      .where(
        and(
          eq(PublicSchema.teamMembers.leagueId, matchup.leagueId),
          inArray(PublicSchema.teamMembers.playerId, playerIds),
        ),
      );

    const playerTeamMap = new Map<number, number>();
    teamAssignments.forEach((ta) => {
      if (ta.teamId !== null) {
        playerTeamMap.set(ta.playerId, ta.teamId);
      }
    });

    // BATCH 1: Fetch all existing season selections for these players in one query
    LOGGER.info(
      `Batch fetching existing season selections for ${playerIds.length} players`,
    );
    const existingSeasons = await db
      .select()
      .from(PublicSchema.leagueWeekPlayerSeasons)
      .where(
        and(
          eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
          eq(
            PublicSchema.leagueWeekPlayerSeasons.weekNumber,
            matchup.weekNumber,
          ),
          inArray(PublicSchema.leagueWeekPlayerSeasons.playerId, playerIds),
        ),
      );

    const existingSeasonMap = new Map<number, number>();
    existingSeasons.forEach((es) => {
      existingSeasonMap.set(es.playerId, es.season);
    });

    // BATCH 2: Fetch all available seasons for all players in one query
    // Query both batting and pitching to handle pitcher-only players
    // Filter to seasons with at least 2x games as matchup requires
    // Only consider seasons from 1901+ (Baseball-Reference has game-level data from 1901 onwards)
    const minGames = (matchup.gamesPerMatchup ?? 7) * 2;
    LOGGER.info(
      `Batch fetching available seasons for ${playerIds.length} players (min ${minGames} games, seasons ${MIN_SEASON_WITH_GAME_DATA}+)`,
    );
    const [allBattingSeasons, allPitchingSeasons] = await Promise.all([
      db
        .select({
          playerId: PublicSchema.seasonBatting.playerId,
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            inArray(PublicSchema.seasonBatting.playerId, playerIds),
            isNotNull(PublicSchema.seasonBatting.g),
            gte(PublicSchema.seasonBatting.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
      db
        .select({
          playerId: PublicSchema.seasonPitching.playerId,
          season: PublicSchema.seasonPitching.season,
          g: PublicSchema.seasonPitching.g,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            inArray(PublicSchema.seasonPitching.playerId, playerIds),
            isNotNull(PublicSchema.seasonPitching.g),
            gte(PublicSchema.seasonPitching.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
    ]);

    // Track max games per player-season (batting or pitching)
    const playerSeasonGames = new Map<string, number>(); // key: "playerId-season"

    allBattingSeasons.forEach((seasonStat) => {
      const key = `${seasonStat.playerId}-${seasonStat.season}`;
      const games = seasonStat.g ?? 0;
      playerSeasonGames.set(
        key,
        Math.max(playerSeasonGames.get(key) ?? 0, games),
      );
    });

    allPitchingSeasons.forEach((seasonStat) => {
      const key = `${seasonStat.playerId}-${seasonStat.season}`;
      const games = seasonStat.g ?? 0;
      playerSeasonGames.set(
        key,
        Math.max(playerSeasonGames.get(key) ?? 0, games),
      );
    });

    // Group seasons by player ID, filtering to only those with enough games
    const seasonsByPlayer = new Map<number, number[]>();

    playerSeasonGames.forEach((games, key) => {
      if (games >= minGames) {
        const [playerIdStr, seasonStr] = key.split('-');
        const playerId = parseInt(playerIdStr, 10);
        const season = parseInt(seasonStr, 10);

        if (!seasonsByPlayer.has(playerId)) {
          seasonsByPlayer.set(playerId, []);
        }
        const seasons = seasonsByPlayer.get(playerId);
        if (seasons && !seasons.includes(season)) {
          seasons.push(season);
        }
      }
    });

    // Prepare batch inserts
    const newSeasonSelections: Array<{
      leagueId: number;
      weekNumber: number;
      playerId: number;
      season: number;
    }> = [];

    const matchupPlayerRecords: Array<{
      matchupId: number;
      playerId: number;
      teamId: number;
    }> = [];

    // Process each player (no DB queries in the loop!)
    for (const player of missingRecords) {
      let selectedSeason: number;

      if (existingSeasonMap.has(player.id)) {
        // Already has a season selected
        const season = existingSeasonMap.get(player.id);
        if (season === undefined) {
          LOGGER.error(
            `Season should exist but is undefined for player ${player.id}`,
          );
          continue;
        }
        selectedSeason = season;
        LOGGER.debug(
          `Player ${player.id} already has season ${selectedSeason}`,
        );
      } else {
        // Need to select a new season
        const availableSeasons = seasonsByPlayer.get(player.id) || [];

        if (availableSeasons.length === 0) {
          // Log detailed info about why no seasons were found
          const playerBattingSeasons = allBattingSeasons
            .filter((s) => s.playerId === player.id)
            .map((s) => `${s.season}(${s.g}g)`);
          const playerPitchingSeasons = allPitchingSeasons
            .filter((s) => s.playerId === player.id)
            .map((s) => `${s.season}(${s.g}g)`);

          LOGGER.warn(`No eligible seasons for player ${player.id}`, {
            minGamesRequired: minGames,
            battingSeasons: playerBattingSeasons,
            pitchingSeasons: playerPitchingSeasons,
          });
          continue;
        }

        // Randomly select a season
        const seasonIdx = cryptoRandomInt(availableSeasons.length);
        selectedSeason = availableSeasons[seasonIdx];

        // Queue for batch insert
        newSeasonSelections.push({
          leagueId: matchup.leagueId,
          weekNumber: matchup.weekNumber,
          playerId: player.id,
          season: selectedSeason,
        });

        LOGGER.debug(
          `Selected season ${selectedSeason} for player ${player.id}`,
        );
      }

      // Queue matchup player record for batch insert
      const teamId = playerTeamMap.get(player.id);
      if (!teamId) {
        LOGGER.error(
          `Player ${player.id} has no team assignment in league ${matchup.leagueId}`,
        );
        continue; // Skip this player
      }

      matchupPlayerRecords.push({
        matchupId: matchup.id,
        playerId: player.id,
        teamId: teamId,
      });
    }

    // BATCH 3: Insert all new season selections in one query
    if (newSeasonSelections.length > 0) {
      LOGGER.info(
        `Batch inserting ${newSeasonSelections.length} new season selections`,
      );
      try {
        await db
          .insert(PublicSchema.leagueWeekPlayerSeasons)
          .values(newSeasonSelections)
          .onConflictDoNothing();
        LOGGER.info(
          `Successfully inserted ${newSeasonSelections.length} season selections`,
        );
      } catch (error) {
        LOGGER.error('Error inserting season selections:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          count: newSeasonSelections.length,
          sample: newSeasonSelections.slice(0, 3),
        });
        throw error;
      }
    }

    // BATCH 4: Insert all matchup player records in one query
    if (matchupPlayerRecords.length > 0) {
      LOGGER.info(
        `Batch inserting ${matchupPlayerRecords.length} matchup player records`,
      );
      try {
        await db
          .insert(PublicSchema.matchupPlayers)
          .values(matchupPlayerRecords)
          .onConflictDoNothing();
        LOGGER.info(
          `Successfully inserted ${matchupPlayerRecords.length} matchup player records`,
        );
      } catch (error) {
        LOGGER.error('Error inserting matchup player records:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          count: matchupPlayerRecords.length,
          sample: matchupPlayerRecords.slice(0, 3),
        });
        throw error;
      }
    }

    totalPlayersAdded += missingRecords.length;
    matchupsProcessed++;
    LOGGER.info(
      `Completed processing matchup ${matchup.id}, added ${missingRecords.length} players`,
    );
  }

  LOGGER.info(
    `Completed all matchups: ${matchupsProcessed} matchups processed, ${totalPlayersAdded} total players added`,
  );

  return {
    playersAdded: totalPlayersAdded,
    matchupsProcessed,
  };
}

/**
 * Main Lambda handler that routes API Gateway requests
 */
const baseGameSelectionHandler = async (
  event: APIGatewayEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info(
    `Game Selection Handler - Method: ${event.httpMethod}, Path: ${event.path}`,
  );
  addBreadcrumb(`Game selection request: ${event.httpMethod} ${event.path}`);

  try {
    // Handle OPTIONS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return handleOptions();
    }

    // Route to appropriate handler based on path
    const path = event.path.replace(/^\/dev/, '').replace(/^\/games/, '');

    switch (path) {
      case '/version':
      case '/health': {
        // Version and health check endpoint
        const versionInfo = getVersionInfo('legacy-sports-game-selection');
        LOGGER.debug('Version endpoint called', versionInfo);

        return addCorsHeaders({
          statusCode: 200,
          body: JSON.stringify({
            status: 'healthy',
            ...versionInfo,
            timestamp: new Date().toISOString(),
            formatted: formatVersionInfo(versionInfo),
          }),
        });
      }

      case '/badge': {
        // shields.io endpoint badge — returns live health JSON consumed directly by the README badge
        return addCorsHeaders({
          statusCode: 200,
          body: JSON.stringify({
            schemaVersion: 1,
            label: 'Game Selection Lambda',
            message: 'healthy',
            color: 'brightgreen',
            cacheSeconds: 60,
            style: 'flat',
          }),
        });
      }

      case '/create-matchup':
        if (event.httpMethod === 'POST') {
          // Parse request body
          const body: CreateMatchupRequestBody = event.body
            ? (JSON.parse(event.body) as CreateMatchupRequestBody)
            : {};

          // Type guard for request body
          if (
            typeof body !== 'object' ||
            body === null ||
            !('league' in body) ||
            !('week' in body)
          ) {
            return addCorsHeaders({
              statusCode: 400,
              body: JSON.stringify({
                error: 'Missing required parameters',
                message: 'Both league and week are required',
              }),
            });
          }

          const { league, week } = body as { league: unknown; week: unknown };

          // Validate parameters
          if (typeof league !== 'number' || typeof week !== 'number') {
            return addCorsHeaders({
              statusCode: 400,
              body: JSON.stringify({
                error: 'Invalid parameters',
                message: 'League and week must be numbers',
              }),
            });
          }

          LOGGER.info(`Creating matchup for league ${league}, week ${week}`);

          // Use existing database connection utility
          const { withDb } = await import('./utils/db');

          try {
            const result = await withDb(async (db) => {
              return await createMatchupForLeagueWeek(db, league, week);
            });

            return addCorsHeaders({
              statusCode: 200,
              body: JSON.stringify({
                message: `Successfully processed ${result.matchupsProcessed} matchup(s)`,
                league,
                week,
                matchupsProcessed: result.matchupsProcessed,
                playersAdded: result.playersAdded,
              }),
            });
          } catch (error) {
            LOGGER.error('Error creating matchup:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              name: error instanceof Error ? error.name : undefined,
              league,
              week,
            });
            throw error;
          }
        }
        break;

      case '/select-game':
        if (event.httpMethod === 'POST') {
          const body: unknown = JSON.parse(event.body || '{}');

          // Type guard for request body
          if (
            typeof body !== 'object' ||
            body === null ||
            !('matchupId' in body) ||
            !('gameNumber' in body)
          ) {
            return addCorsHeaders({
              statusCode: 400,
              body: JSON.stringify({
                error: 'Missing required fields',
                message: 'matchupId and gameNumber are required',
              }),
            });
          }

          const { matchupId, gameNumber } = body as {
            matchupId: number;
            gameNumber: number;
          };

          LOGGER.info(`Selecting game ${gameNumber} for matchup ${matchupId}`);

          // Use existing database connection utility
          const { withDb } = await import('./utils/db');

          try {
            const result = await withDb(async (db) => {
              return await selectGameForMatchup(db, matchupId, gameNumber);
            });

            return addCorsHeaders({
              statusCode: 200,
              body: JSON.stringify({
                message: `Successfully selected game ${gameNumber} for matchup ${matchupId}`,
                matchupId,
                gameNumber,
                playersProcessed: result.playersProcessed,
                gamesCreated: result.gamesCreated,
                gamesRemaining: result.gamesRemaining,
              }),
            });
          } catch (error) {
            LOGGER.error('Error selecting game:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              matchupId,
              gameNumber,
            });
            throw error;
          }
        }
        break;

      case '':
      case '/':
        return addCorsHeaders({
          statusCode: 200,
          body: JSON.stringify({
            service: 'Game Selection Service',
            status: 'healthy',
            endpoints: [
              '/version',
              '/health',
              '/create-matchup',
              '/select-game',
            ],
          }),
        });
    }

    // Path not found
    return addCorsHeaders({
      statusCode: 404,
      body: JSON.stringify({
        error: 'Not found',
        path: event.path,
        availableEndpoints: ['/games/create-matchup', '/games/select-game'],
      }),
    });
  } catch (error) {
    LOGGER.error('Error in game selection handler:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      path: event.path,
      method: event.httpMethod,
    });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        lambda: 'game-selection',
        path: event.path,
        method: event.httpMethod,
      },
    });

    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
};

// Export the Sentry-wrapped handler
export const handler = async (
  event: APIGatewayEvent | SQSEvent,
  context: Context,
): Promise<APIGatewayProxyResult | SQSBatchResponse> => {
  // Detect event type and route to appropriate handler
  if (
    'Records' in event &&
    Array.isArray(event.Records) &&
    event.Records[0]?.eventSource === 'aws:sqs'
  ) {
    // SQS Event - route to select-game handler
    LOGGER.info('Detected SQS event, routing to select-game handler');
    return selectGameHandler(event);
  }

  // API Gateway Event - route to main handler
  return await withSentry(baseGameSelectionHandler)(
    event as APIGatewayEvent,
    context,
  );
};
