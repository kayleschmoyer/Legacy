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
} from '@legacy-sports/sentry';
import {
  getMissingMatchupRecords,
  PublicSchema,
} from '@legacy-sports/db-client';
import type { PublicDb } from '@legacy-sports/db-client';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

/**
 * Queue a matchup stats loading job to SQS
 * Splits large player lists into batches to avoid Lambda timeouts
 * Each batch is processed sequentially within the same matchup group
 */
async function queueMatchupStatsLoad(
  matchupId: number,
  gameRecords: Array<{
    matchupPlayerId: number;
    playerId: number;
    brefId: string;
    season: number;
    battingGameNum: number;
    pitchingGameNum: number;
    fieldingGameNum: number;
    fieldingGamePos: string;
  }>,
): Promise<void> {
  if (!GAME_STATS_QUEUE_URL) {
    LOGGER.warn(
      'SQS_LOAD_GAME_STATS_URL not configured, skipping stats loading',
    );
    return;
  }

  // Split players into batches of 10 to avoid Lambda timeouts
  // Each player takes ~10-12 seconds, so 10 players = ~2 minutes (well under timeout)
  const BATCH_SIZE = 10;
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

  // 2. Get all matchup_players for this matchup with their selected seasons
  const matchupPlayersWithSeasons = await db
    .select({
      matchupPlayerId: PublicSchema.matchupPlayers.id,
      playerId: PublicSchema.matchupPlayers.playerId,
      teamId: PublicSchema.matchupPlayers.teamId,
      season: PublicSchema.leagueWeekPlayerSeasons.season,
      brefId: PublicSchema.players.brefId,
    })
    .from(PublicSchema.matchupPlayers)
    .innerJoin(
      PublicSchema.leagueWeekPlayerSeasons,
      and(
        eq(
          PublicSchema.leagueWeekPlayerSeasons.playerId,
          PublicSchema.matchupPlayers.playerId,
        ),
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchupData.leagueId),
        eq(
          PublicSchema.leagueWeekPlayerSeasons.weekNumber,
          matchupData.weekNumber,
        ),
      ),
    )
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.players.id, PublicSchema.matchupPlayers.playerId),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  if (matchupPlayersWithSeasons.length === 0) {
    throw new Error(`No players found for matchup ${matchupId}`);
  }

  LOGGER.info(
    `Found ${matchupPlayersWithSeasons.length} players to select games for`,
  );

  // 3. For each player, select a random game from their season
  const gameRecords: Array<{
    matchupPlayerId: number;
    gameNum: number;
    battingGameNum: number | null;
    fieldingGameNum: number | null;
    pitchingGameNum: number | null;
    fieldingGamePos: string;
  }> = [];

  // Collect player data for queue message
  const playersForStatsLoading: Array<{
    matchupPlayerId: number;
    playerId: number;
    brefId: string;
    season: number;
    battingGameNum: number;
    pitchingGameNum: number;
    fieldingGameNum: number;
    fieldingGamePos: string;
  }> = [];

  for (const player of matchupPlayersWithSeasons) {
    // Check if this player already has a game selected for this game number
    const existingGame = await db
      .select()
      .from(PublicSchema.matchupPlayerGames)
      .where(
        and(
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            player.matchupPlayerId,
          ),
          eq(PublicSchema.matchupPlayerGames.gameNum, gameNumber),
        ),
      )
      .limit(1);

    if (existingGame.length > 0) {
      LOGGER.debug(
        `Player ${player.playerId} already has game ${gameNumber} selected, skipping`,
      );
      continue;
    }

    // For baseball, games are numbered 1-162
    // Pick random game numbers for each stat type
    const MAX_GAMES_PER_SEASON = 162;

    // Select random game numbers for each stat type
    const battingGameNum = Math.floor(Math.random() * MAX_GAMES_PER_SEASON) + 1;
    const pitchingGameNum =
      Math.floor(Math.random() * MAX_GAMES_PER_SEASON) + 1;
    const fieldingGameNum =
      Math.floor(Math.random() * MAX_GAMES_PER_SEASON) + 1;

    LOGGER.debug(
      `Selected games for player ${player.playerId}: batting=${battingGameNum}, pitching=${pitchingGameNum}, fielding=${fieldingGameNum}`,
    );

    // Get primary position from season stats
    const seasonFielding = await db
      .select({
        pos: PublicSchema.seasonFielding.pos,
      })
      .from(PublicSchema.seasonFielding)
      .where(
        and(
          eq(PublicSchema.seasonFielding.playerId, player.playerId),
          eq(PublicSchema.seasonFielding.season, player.season),
        ),
      )
      .limit(1);

    const fieldingGamePos = seasonFielding[0]?.pos || 'XX';

    // Create game record with all stat-specific game numbers populated
    gameRecords.push({
      matchupPlayerId: player.matchupPlayerId,
      gameNum: gameNumber,
      battingGameNum,
      fieldingGameNum,
      pitchingGameNum,
      fieldingGamePos,
    });

    // Collect data for stats loading
    playersForStatsLoading.push({
      matchupPlayerId: player.matchupPlayerId,
      playerId: player.playerId,
      brefId: player.brefId,
      season: player.season,
      battingGameNum,
      pitchingGameNum,
      fieldingGameNum,
      fieldingGamePos,
    });
  }

  // 4. Batch insert all game records
  if (gameRecords.length > 0) {
    LOGGER.info(`Batch inserting ${gameRecords.length} game records`);
    await db
      .insert(PublicSchema.matchupPlayerGames)
      .values(gameRecords)
      .onConflictDoNothing();
    LOGGER.info(`Successfully inserted ${gameRecords.length} game records`);

    // Queue ONE message for the entire matchup to load all stats sequentially
    if (playersForStatsLoading.length > 0) {
      // Update matchup status to 'loading' before queuing
      await db
        .update(PublicSchema.matchups)
        .set({ statsLoadingStatus: 'loading' })
        .where(eq(PublicSchema.matchups.id, matchupId));
      LOGGER.info(`Set matchup ${matchupId} stats_loading_status to 'loading'`);

      await queueMatchupStatsLoad(matchupId, playersForStatsLoading);
    }
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
    `Games selected: ${gamesSelected}/${gamesPerMatchup}, remaining: ${gamesRemaining}`,
  );

  LOGGER.info(`Game selection complete for matchup ${matchupId}`);
  LOGGER.info(
    `Stats loaded on-demand from Baseball Reference for ${gameRecords.length} players`,
  );
  LOGGER.info(
    `Stats aggregation available via GraphQL matchup.players.aggregatedStats query`,
  );

  return {
    playersProcessed: matchupPlayersWithSeasons.length,
    gamesCreated: gameRecords.length,
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
    LOGGER.info(
      `Batch fetching available seasons for ${playerIds.length} players`,
    );
    const allPlayerSeasons = await db
      .select()
      .from(PublicSchema.seasonBatting)
      .where(inArray(PublicSchema.seasonBatting.playerId, playerIds));

    // Group seasons by player ID
    const seasonsByPlayer = new Map<number, number[]>();
    allPlayerSeasons.forEach((seasonStat) => {
      if (!seasonsByPlayer.has(seasonStat.playerId)) {
        seasonsByPlayer.set(seasonStat.playerId, []);
      }
      const seasons = seasonsByPlayer.get(seasonStat.playerId);
      if (seasons && !seasons.includes(seasonStat.season)) {
        seasons.push(seasonStat.season);
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
          LOGGER.warn(`No seasons found for player ${player.id}, skipping`);
          continue;
        }

        // Randomly select a season
        const seasonIdx = Math.floor(Math.random() * availableSeasons.length);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      case '/health':
      case '':
      case '/':
        return addCorsHeaders({
          statusCode: 200,
          body: JSON.stringify({
            service: 'Game Selection Service',
            status: 'healthy',
            endpoints: ['/create-matchup', '/select-game'],
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
