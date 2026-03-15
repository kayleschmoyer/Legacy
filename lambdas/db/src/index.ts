import {
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { createApolloHandler, createLambdaHandler } from './server';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Create database service for Lambda (module-level singleton for warm starts)
const dbService = createDatabaseService(getDbOptions());

// Create notification service (module-level singleton)
const notificationService = createNotificationService();

// Create Apollo handler with authentication context
const baseHandler = createApolloHandler(dbService, notificationService);

// Wrap with CORS, health checks, and error handling
const baseGraphQLHandler = createLambdaHandler(baseHandler);

// Export the Rollbar-wrapped handler
export const handler = withRollbar(baseGraphQLHandler);
