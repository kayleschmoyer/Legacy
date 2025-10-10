import * as Sentry from '@sentry/node';
import { LOGGER } from '@legacy-sports/logging';

export interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate?: number;
  debug?: boolean;
  beforeSend?: (event: Sentry.Event) => Sentry.Event | null;
}

/**
 * Initialize Sentry for Lambda functions
 * Call this at the top of your lambda handler file
 */
export function initSentry(config: SentryConfig): void {
  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      tracesSampleRate: config.tracesSampleRate || 0.1,
      debug: config.debug || false,
      
      // Lambda-specific configuration
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Console(),
      ],
      
      // Custom beforeSend to filter out noise
      beforeSend: config.beforeSend || ((event) => {
        // Filter out health check errors or other noise if needed
        return event;
      }),
      
      // Set initial tags
      initialScope: {
        tags: {
          component: 'lambda',
          runtime: 'nodejs',
        },
      },
    });

    LOGGER.info('Sentry initialized successfully', { 
      environment: config.environment,
      tracesSampleRate: config.tracesSampleRate || 0.1 
    });
  } catch (error) {
    LOGGER.error('Failed to initialize Sentry', error as Error);
  }
}

/**
 * Wrap lambda handler with Sentry error capturing
 * This ensures all unhandled errors are sent to Sentry
 */
export function withSentry<TEvent, TResult>(
  handler: (event: TEvent, context: any) => Promise<TResult>
) {
  return async (event: TEvent, context: any): Promise<TResult> => {
    // Set context for this invocation
    Sentry.configureScope((scope) => {
      scope.setTag('lambda.requestId', context.awsRequestId);
      scope.setTag('lambda.functionName', context.functionName);
      scope.setTag('lambda.functionVersion', context.functionVersion);
      scope.setContext('lambda', {
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        requestId: context.awsRequestId,
        memoryLimitInMB: context.memoryLimitInMB,
        remainingTimeInMillis: context.getRemainingTimeInMillis(),
      });
    });

    try {
      const result = await handler(event, context);
      return result;
    } catch (error) {
      // Capture the error in Sentry
      Sentry.captureException(error);
      
      // Wait for Sentry to send the error before the Lambda exits
      await Sentry.flush(2000);
      
      // Re-throw the error to maintain normal error handling
      throw error;
    }
  };
}

/**
 * Capture a custom error with additional context
 */
export function captureError(error: Error, context?: Record<string, any>): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('custom', context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, data?: Record<string, any>, level?: 'info' | 'warning' | 'error'): void {
  Sentry.addBreadcrumb({
    message,
    data,
    level: level || 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Get Sentry configuration from environment variables
 */
export function getSentryConfigFromEnv(): SentryConfig | null {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  
  if (!dsn) {
    LOGGER.warn('SENTRY_DSN environment variable not set, Sentry will not be initialized');
    return null;
  }
  
  return {
    dsn,
    environment,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    debug: process.env.SENTRY_DEBUG === 'true',
  };
}
