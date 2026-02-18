import { ApolloServer } from '@apollo/server';
import {
  handlers,
  startServerAndCreateLambdaHandler,
} from '@as-integrations/aws-lambda';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { LOGGER } from '@legacy-sports/logging';
import {
  createNotificationService,
  retrieveSecretParameterValue,
} from '@legacy-sports/aws-utils';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { createDatabaseService } from '@legacy-sports/db-client';
import {
  formatVersionInfo,
  getDbOptions,
  getVersionInfo,
} from '@legacy-sports/utils';
import { schema } from './schema';
import { createLoaders } from './schema/dataloaders';

interface JWTPayload {
  id: number | string;
  email?: string;
  username: string;
  accessLevel?: string;
  isAdmin?: boolean;
  [key: string]: unknown; // For other JWT standard fields
}

interface User {
  id: number;
  email?: string;
  username: string;
  isAdmin: boolean;
}

const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] || '';
let jwtSecretPromise: Promise<string> | null = null;

async function getJwtSecret(): Promise<string> {
  if (!JWT_SECRET_NAME) {
    throw new Error('JWT_SECRET_NAME is not set');
  }

  if (!jwtSecretPromise) {
    jwtSecretPromise = retrieveSecretParameterValue(JWT_SECRET_NAME);
  }

  return jwtSecretPromise;
}

function parseUserFromJwtPayload(payload: JWTPayload): User {
  const idRaw = payload.id;
  const id = typeof idRaw === 'string' ? Number(idRaw) : idRaw;
  if (!Number.isFinite(id)) {
    throw new Error('Invalid JWT payload: id must be a number');
  }

  if (typeof payload.username !== 'string' || payload.username.length === 0) {
    throw new Error('Invalid JWT payload: username is required');
  }

  const accessLevel =
    typeof payload.accessLevel === 'string' ? payload.accessLevel : undefined;

  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    username: payload.username,
    isAdmin: payload.isAdmin === true || accessLevel === 'admin',
  };
}

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Create database service for Lambda (module-level singleton for warm starts)
const dbService = createDatabaseService(getDbOptions());

// Create notification service (module-level singleton)
const notificationService = createNotificationService();

/**
 * Example Career Statistics GraphQL Queries
 *
 * Use these queries to test the career statistics functionality:
 *
 * 1. Top Home Run Hitters:
 * ```graphql
 * query TopHomeRunHitters {
 *   careerBattingStats(limit: 10, orderBy: "homeRuns", orderDirection: "desc", minHomeRuns: 100) {
 *     playerId
 *     games
 *     atBats
 *     hits
 *     homeRuns
 *     rbi
 *     battingAverage
 *     onBasePercentage
 *     sluggingPercentage
 *   }
 * }
 * ```
 *
 * 2. Top Pitchers by Wins:
 * ```graphql
 * query TopPitchersByWins {
 *   careerPitchingStats(limit: 10, orderBy: "wins", orderDirection: "desc", minWins: 100) {
 *     playerId
 *     wins
 *     losses
 *     games
 *     strikeouts
 *     era
 *     winPercentage
 *   }
 * }
 * ```
 *
 * 3. Player Career Stats by ID:
 * ```graphql
 * query PlayerCareerStats($playerId: Int!) {
 *   playerCareerBatting(playerId: $playerId) {
 *     games
 *     atBats
 *     hits
 *     homeRuns
 *     rbi
 *     battingAverage
 *     sluggingPercentage
 *   }
 *   playerCareerPitching(playerId: $playerId) {
 *     wins
 *     losses
 *     games
 *     strikeouts
 *     era
 *     winPercentage
 *   }
 *   playerCareerFielding(playerId: $playerId) {
 *     games
 *     putouts
 *     assists
 *     errors
 *     fieldingPercentage
 *   }
 * }
 * ```
 *
 * 4. Career Fielding Stats:
 * ```graphql
 * query CareerFieldingStats {
 *   careerFieldingStats(limit: 20, orderBy: "games", orderDirection: "desc", minGames: 500) {
 *     playerId
 *     games
 *     putouts
 *     assists
 *     errors
 *     fieldingPercentage
 *     positions
 *   }
 * }
 * ```
 *
 * 5. All Available Players (to get player IDs):
 * ```graphql
 * query AllPlayers {
 *   players(limit: 50) {
 *     id
 *     firstName
 *     lastName
 *     brefId
 *   }
 * }
 * ```
 */

// CORS headers constant
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Create Apollo Server instance
const server = new ApolloServer({
  schema,
  // Enable introspection and playground in development
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    // Enable GraphQL Playground/Studio in non-production environments
    process.env.NODE_ENV !== 'production'
      ? ApolloServerPluginLandingPageLocalDefault({
          embed: true,
          includeCookies: true,
        })
      : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
  ],
  formatError: (formattedError, error) => {
    // Log all errors with full context
    LOGGER.error('GraphQL error', {
      message: formattedError.message,
      path: formattedError.path,
      extensions: formattedError.extensions,
      locations: formattedError.locations,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return the formatted error to the client
    return formattedError;
  },
});

// Create base handler with authentication context
const baseHandler = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventRequestHandler(),
  {
    context: async ({ event }) => {
      // Extract JWT from Authorization header
      const authorization =
        event.headers.authorization || event.headers.Authorization;
      let user: User | null = null;

      if (authorization && authorization.startsWith('Bearer ')) {
        try {
          const token = authorization.substring(7); // Remove 'Bearer ' prefix

          const jwtSecret = await getJwtSecret();
          const decoded = verify(token, jwtSecret, {
            algorithms: ['HS256'],
          }) as JWTPayload;

          user = parseUserFromJwtPayload(decoded);
        } catch (error) {
          LOGGER.warn('Failed to decode JWT', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Create a shared database connection for this request
      // This prevents each resolver from creating its own connection
      const db = await dbService.getDb();

      return {
        notificationService, // WebSocket notification service
        user,
        loaders: createLoaders(db), // Pass shared connection to loaders
        db, // Shared connection for all resolvers in this request
      };
    },
  },
);

// Base Lambda handler with proper CORS and error handling
const baseGraphQLHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('GraphQL lambda invoked', {
    httpMethod: event.httpMethod,
    path: event.path,
  });
  addBreadcrumb(`GraphQL request: ${event.httpMethod} ${event.path}`);

  // Ensure Lambda doesn't wait for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;

  // Handle preflight OPTIONS requests
  if (event.httpMethod === 'OPTIONS') {
    LOGGER.debug('Handling OPTIONS preflight request');
    addBreadcrumb('Handling OPTIONS preflight request');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Handle version/health check endpoint
  if (event.path === '/version' || event.path === '/health') {
    const versionInfo = getVersionInfo('legacy-sports-gql');
    LOGGER.debug('Version endpoint called', versionInfo);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'healthy',
        ...versionInfo,
        timestamp: new Date().toISOString(),
        formatted: formatVersionInfo(versionInfo),
      }),
    };
  }

  try {
    LOGGER.debug('Calling Apollo Server handler');

    // Call Apollo Server handler - it may be callback-based despite returning a Promise
    const result = await new Promise<APIGatewayProxyResult>(
      (resolve, reject) => {
        // Try calling baseHandler with callback - type as unknown first for safety
        const baseHandlerUnknown = baseHandler as unknown;

        // Define callback function type
        type CallbackFunction = (
          error: unknown,
          result?: APIGatewayProxyResult,
        ) => void;

        const callback: CallbackFunction = (
          error: unknown,
          result?: APIGatewayProxyResult,
        ) => {
          if (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            reject(new Error(`Apollo Server error: ${errorMessage}`));
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('No result from Apollo Server'));
          }
        };

        // Type assertion for handler function
        type HandlerFunction = (
          event: APIGatewayProxyEvent,
          context: Context,
          callback: CallbackFunction,
        ) => unknown;

        const callbackResult = (baseHandlerUnknown as HandlerFunction)(
          event,
          context,
          callback,
        );

        // If it returns a Promise instead, use that
        if (
          callbackResult &&
          typeof callbackResult === 'object' &&
          callbackResult !== null
        ) {
          const maybePromise = callbackResult as { then?: unknown };
          if (typeof maybePromise.then === 'function') {
            const promiseResult =
              callbackResult as Promise<APIGatewayProxyResult>;
            void promiseResult.then(resolve).catch(reject);
          }
        }
      },
    );

    LOGGER.debug('Apollo Server result received, adding CORS headers');

    // Ensure result is valid
    if (!result) {
      throw new Error('Apollo Server returned no result');
    }

    // Add CORS headers to the result
    return {
      ...result,
      headers: {
        ...CORS_HEADERS,
        ...(result.headers || {}),
      },
    };
  } catch (error) {
    LOGGER.error('GraphQL lambda handler error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Capture error with request context
    captureError(error as Error, {
      httpMethod: event.httpMethod,
      path: event.path,
      query: event.queryStringParameters,
      headers: event.headers,
      operation: 'graphql_request',
    });

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

// Export the Sentry-wrapped handler
export const handler = withSentry(baseGraphQLHandler);
