import {
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { createApolloHandler, createLambdaHandler } from './server';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Create database service for Lambda (module-level singleton for warm starts)
const dbService = createDatabaseService(getDbOptions());

// Create notification service (module-level singleton)
const notificationService = createNotificationService();

// Create Apollo handler with authentication context
const baseHandler = createApolloHandler(dbService, notificationService);

// Wrap with CORS, health checks, and error handling
const baseGraphQLHandler = createLambdaHandler(baseHandler);

// Export the Sentry-wrapped handler
export const handler = withSentry(baseGraphQLHandler);
