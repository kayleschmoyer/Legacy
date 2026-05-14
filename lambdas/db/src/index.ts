import {
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { createApolloHandler, createLambdaHandler } from './server';
import { getJwtSecret } from './server/context';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Create database service for Lambda (module-level singleton for warm starts)
const dbService = createDatabaseService(getDbOptions());

// Kick off DB pool and JWT secret fetch during Lambda init so they complete
// before the first request arrives, eliminating cold-start 504 timeouts.
void dbService.getDb().catch((err: unknown) => {
  LOGGER.error(
    'Eager DB initialization failed',
    err instanceof Error ? err : new Error(String(err)),
  );
});
void getJwtSecret().catch((err: unknown) => {
  LOGGER.error(
    'Eager JWT secret prefetch failed',
    err instanceof Error ? err : new Error(String(err)),
  );
});

// Create notification service (module-level singleton)
const notificationService = createNotificationService();

// Create Apollo handler with authentication context
const baseHandler = createApolloHandler(dbService, notificationService);

// Wrap with CORS, health checks, and error handling
const baseGraphQLHandler = createLambdaHandler(baseHandler);

// Export the Rollbar-wrapped handler
export const handler = withRollbar(baseGraphQLHandler);
