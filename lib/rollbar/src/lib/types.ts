/**
 * Shared Rollbar interface for cross-platform compatibility
 * This interface abstracts away platform-specific Rollbar implementations
 */

export interface RollbarConfig {
  accessToken: string;
  environment: string;
  captureUncaught?: boolean;
  captureUnhandledRejections?: boolean;
  verbose?: boolean;
  release?: string;
  /** Maximum error items to send per minute. Set to 0 for unlimited. Defaults to 0. */
  maxItems?: number;
}

export interface RollbarBreadcrumb {
  message: string;
  data?: Record<string, unknown>;
  level?: 'info' | 'warning' | 'error';
}

/**
 * Cross-platform Rollbar interface
 * All platform implementations must implement these methods
 */
export interface RollbarInterface {
  /**
   * Initialize Rollbar for the current platform
   */
  init(config: RollbarConfig): void;

  /**
   * Capture an error with optional context
   */
  captureError(error: Error, context?: Record<string, unknown>): void;

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void;

  /**
   * Wrap a handler function with Rollbar error handling
   */
  withSentry<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => TResult | Promise<TResult>;

  /**
   * Get Rollbar configuration from environment variables
   */
  getSentryConfigFromEnv(): RollbarConfig | null;
}

// Legacy alias so consumers that reference SentryConfig still compile
export type SentryConfig = RollbarConfig;
export type SentryBreadcrumb = RollbarBreadcrumb;
