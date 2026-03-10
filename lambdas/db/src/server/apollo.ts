import { ApolloServer } from '@apollo/server';
import {
  handlers,
  startServerAndCreateLambdaHandler,
} from '@as-integrations/aws-lambda';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';
import type { GenericDatabase } from '@legacy-sports/db-client';
import type * as PublicSchema from '@legacy-sports/db-client/src/drizzle/public/schema';
import { LOGGER } from '@legacy-sports/logging';
import { extractUserFromEvent, type User } from './context';
import { createLoaders } from '../schema/dataloaders';
import { schema } from '../schema';

// Create Apollo Server instance
export const server = new ApolloServer({
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

    // Mask internal errors — only pass through client-facing error messages.
    // User-visible codes (validation, auth, bad input) are safe to return as-is.
    const clientFacingCodes = new Set([
      'GRAPHQL_VALIDATION_FAILED',
      'GRAPHQL_PARSE_FAILED',
      'BAD_USER_INPUT',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'PERSISTED_QUERY_NOT_FOUND',
      'PERSISTED_QUERY_NOT_SUPPORTED',
    ]);
    const code = formattedError.extensions?.code as string | undefined;
    if (code && clientFacingCodes.has(code)) {
      return formattedError;
    }

    // Strip internal message; retain path/locations for client-side error correlation.
    return {
      ...formattedError,
      message: 'Internal server error',
    };
  },
});

/**
 * Create the Apollo Lambda handler with authentication context.
 */
export function createApolloHandler(
  dbService: { getDb: () => Promise<GenericDatabase<typeof PublicSchema>> },
  notificationService: WebSocketNotificationService | null,
) {
  return startServerAndCreateLambdaHandler(
    server,
    handlers.createAPIGatewayProxyEventRequestHandler(),
    {
      context: async ({ event }) => {
        // Extract JWT from Authorization header
        const authorization =
          event.headers.authorization || event.headers.Authorization;
        const user: User | null = await extractUserFromEvent(authorization);

        // Check for system API key (EventBridge / admin CLI invocations)
        const systemApiKey = process.env.SYSTEM_API_KEY;
        const requestApiKey =
          event.headers['x-system-api-key'] ||
          event.headers['X-System-Api-Key'];
        const isSystemRequest =
          !!systemApiKey &&
          systemApiKey.length > 0 &&
          requestApiKey === systemApiKey;

        // Create a shared database connection for this request
        // This prevents each resolver from creating its own connection
        const db = await dbService.getDb();

        return {
          notificationService, // WebSocket notification service
          user,
          isSystemRequest,
          loaders: createLoaders(db), // Pass shared connection to loaders
          db, // Shared connection for all resolvers in this request
        };
      },
    },
  );
}
