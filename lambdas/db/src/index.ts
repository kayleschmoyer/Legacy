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
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { schema } from './schema';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

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
      let user = null;

      if (authorization && authorization.startsWith('Bearer ')) {
        try {
          const token = authorization.substring(7); // Remove 'Bearer ' prefix

          // Decode JWT payload (simple base64 decode - no signature verification for lambda)
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(
              Buffer.from(
                parts[1].replace(/-/g, '+').replace(/_/g, '/'),
                'base64',
              ).toString(),
            );

            user = {
              id: payload.id,
              email: payload.email,
              username: payload.username,
              isAdmin: payload.isAdmin || false,
            };
          }
        } catch (error) {
          console.warn(`Failed to decode JWT: ${error}`);
        }
      }

      return { user };
    },
  },
);

// Base Lambda handler with proper CORS and error handling
const baseGraphQLHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  console.log('Lambda handler invoked with method:', event.httpMethod);
  addBreadcrumb(`GraphQL request: ${event.httpMethod} ${event.path}`);

  // Ensure Lambda doesn't wait for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;

  // Handle preflight OPTIONS requests
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    addBreadcrumb('Handling OPTIONS preflight request');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    console.log('Calling Apollo Server handler...');

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

    console.log('Apollo Server result received, adding CORS headers');

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
    console.error('Lambda handler error:', error);

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
