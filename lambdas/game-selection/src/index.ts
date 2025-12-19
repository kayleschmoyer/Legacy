import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
  addBreadcrumb,
  captureError,
} from '@legacy-sports/sentry';
import {
  getPublicDbConnection,
  getMatchup,
  createMatchup,
  getMissingMatchupRecords,
  getSeasonBattingStatsForPlayer,
  createMatchupRecord,
  CreateMatchupPlayer,
  PublicDb,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

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

/**
 * Create matchup records for players in a matchup
 */
async function createMatchupForLeagueWeek(
  db: PublicDb,
  league: number,
  week: number,
): Promise<{ playersAdded: number; matchupId: number; created: boolean }> {
  let matchup = await getMatchup(db, league, week);
  let created = false;

  if (matchup === null) {
    LOGGER.info(`Matchup not found for league ${league}, week ${week}, creating new matchup`);
    matchup = await createMatchup(db, {
      leagueId: league,
      weekNumber: week,
    });
    created = true;
    LOGGER.info(`Created matchup ${matchup.id} for league ${league}, week ${week}`);
  }

  const missingRecords = await getMissingMatchupRecords(db, matchup.id);

  LOGGER.info(`Found ${missingRecords.length} players needing matchup records`);

  for (const player of missingRecords) {
    const seasons = await getSeasonBattingStatsForPlayer(db, player.id);
    
    if (seasons.length === 0) {
      LOGGER.warn(`No seasons found for player ${player.id}, skipping`);
      continue;
    }

    // Randomly select a season for this matchup
    const seasonIdx = Math.floor(Math.random() * seasons.length);
    const season = seasons[seasonIdx];

    const record: CreateMatchupPlayer = {
      matchupId: matchup.id,
      playerId: player.id,
      season: season.season,
    };

    LOGGER.debug(
      `Creating matchup record: matchup=${matchup.id}, player=${player.id}, season=${season.season}`,
    );

    await createMatchupRecord(db, record);
  }

  return {
    playersAdded: missingRecords.length,
    matchupId: matchup.id,
    created,
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
          const body = event.body ? JSON.parse(event.body) : {};
          const { league, week } = body;

          if (!league || !week) {
            return addCorsHeaders({
              statusCode: 400,
              body: JSON.stringify({
                error: 'Missing required parameters',
                message: 'Both league and week are required',
              }),
            });
          }

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
          const { getDb } = await import('./utils/db');
          const dbConnection = await getDb();
          const db = dbConnection.db;

          try {
            const result = await createMatchupForLeagueWeek(
              db,
              league,
              week,
            );

            return addCorsHeaders({
              statusCode: 200,
              body: JSON.stringify({
                message: result.created 
                  ? 'Matchup created and populated successfully'
                  : 'Matchup populated successfully',
                league,
                week,
                matchupId: result.matchupId,
                playersAdded: result.playersAdded,
                created: result.created,
              }),
            });
          } catch (error) {
            LOGGER.error('Error creating matchup:', {
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
        break;

      case '/select-game':
        if (event.httpMethod === 'POST') {
          // TODO: Implement game selection logic
          return addCorsHeaders({
            statusCode: 501,
            body: JSON.stringify({
              error: 'Not implemented',
              message: 'Game selection not yet implemented',
            }),
          });
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
  event: APIGatewayEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  return await withSentry(baseGameSelectionHandler)(event, context);
};
