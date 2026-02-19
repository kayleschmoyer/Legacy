/**
 * Shared Sentry interface for cross-platform compatibility
 * This interface abstracts away platform-specific Sentry implementations
 */

export interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate?: number;
  debug?: boolean;
  /** Platform-specific beforeSend callback. Type varies by Sentry SDK. */
  beforeSend?: unknown;
  release?: string;
}

export interface SentryBreadcrumb {
  message: string;
  data?: Record<string, unknown>;
  level?: 'info' | 'warning' | 'error';
}

/**
 * Cross-platform Sentry interface
 * All platform implementations must implement these methods
 */
export interface SentryInterface {
  /**
   * Initialize Sentry for the current platform
   */
  init(config: SentryConfig): void;

  /**
   * Capture an error with optional context
   */
  captureError(error: Error, context?: Record<string, unknown>): void;

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void;

  /**
   * Wrap a handler function with Sentry error handling
   * For Lambda functions, this handles the AWS Lambda context
   * For React Native, this handles React error boundaries
   */
  withSentry<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => TResult | Promise<TResult>;

  /**
   * Get Sentry configuration from environment variables
   */
  getSentryConfigFromEnv(): SentryConfig | null;
}
