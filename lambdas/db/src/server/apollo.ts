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
import { extractUserFromApiEvent, type User } from './context';
import {
  MAX_QUERY_COMPLEXITY,
  MAX_QUERY_DEPTH,
  queryComplexityLimitRule,
  queryDepthLimitRule,
} from './graphql-validation-rules';
import { CLIENT_FACING_CODES } from './graphql-error-codes';
import { createLoaders } from '../schema/dataloaders';
import { schema } from '../schema';

// Create Apollo Server instance
export const server = new ApolloServer({
  schema,
  // Enable introspection and playground in development
  introspection: process.env.NODE_ENV !== 'production',
  // Guard against DoS via deeply-nested or excessively-wide queries.
  // These run synchronously during the validation phase, before any resolver.
  // OWASP A05:2021 - Security Misconfiguration
  validationRules: [
    queryDepthLimitRule(MAX_QUERY_DEPTH),
    queryComplexityLimitRule(MAX_QUERY_COMPLEXITY),
  ],
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
    // Classify error: user-visible codes (validation, auth, bad input) are
    // expected and should NOT be reported to Rollbar.
    const code = formattedError.extensions?.code as string | undefined;
    const isClientFacing = code != null && CLIENT_FACING_CODES.has(code);

    const errorContext = {
      message: formattedError.message,
      path: formattedError.path,
      extensions: formattedError.extensions,
      locations: formattedError.locations,
      stack: error instanceof Error ? error.stack : undefined,
    };

    if (isClientFacing) {
      // Omit stack and extensions to reduce log volume and avoid leaking internals.
      const {
        stack: _stack,
        extensions: _ext,
        ...clientErrorContext
      } = errorContext;

      if (
        code === 'GRAPHQL_VALIDATION_FAILED' ||
        code === 'GRAPHQL_PARSE_FAILED'
      ) {
        // Validation/parse errors are expected client-input issues (including
        // depth/complexity rejections) — log at debug to avoid production noise.
        LOGGER.debug('GraphQL validation error', clientErrorContext);
      } else {
        // Auth, permission, not-found — potentially actionable, keep at warn.
        LOGGER.warn('GraphQL client error', clientErrorContext);
      }
      return formattedError;
    }

    // Internal/unexpected errors — log at error (forwarded to Rollbar).
    // Prefer error.originalError so RollbarOutputDestination captures the real stack.
    if (error instanceof Error) {
      const originalError =
        'originalError' in error && error.originalError instanceof Error
          ? error.originalError
          : error;
      LOGGER.error('GraphQL internal error', originalError, errorContext);
    } else {
      LOGGER.error('GraphQL internal error', errorContext);
    }

    // Return a sanitized response: no internal message, no extensions beyond
    // the error code, and no SDL locations that could disclose schema internals.
    return {
      message: 'Internal server error',
      path: formattedError.path,
      extensions: { code: code ?? 'INTERNAL_SERVER_ERROR' },
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
        // Extract JWT from Authorization header or HttpOnly cookie (with CSRF)
        const user: User | null = await extractUserFromApiEvent(event);

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
