/**
 * Shared Rollbar interface for cross-platform compatibility
 * This interface abstracts away platform-specific Rollbar implementations
 */

/** Rollbar severity level. Defaults to 'error' when not specified. */
export type RollbarSeverity = 'error' | 'warning' | 'info';

export interface RollbarConfig {
  accessToken: string;
  environment: string;
  captureUncaught?: boolean;
  captureUnhandledRejections?: boolean;
  verbose?: boolean;
  release?: string;
  /** Maximum total error items to send per session/invocation. Defaults to 50. */
  maxItems?: number;
  /** Maximum error items to send per minute. Defaults to 25. */
  itemsPerMinute?: number;
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
   * Capture an error with optional context and severity level.
   * Use 'warning' for non-critical issues (soft validation failures, expected
   * timeouts) and 'info' for informational events. Defaults to 'error'.
   */
  captureError(
    error: Error,
    context?: Record<string, unknown>,
    severity?: RollbarSeverity,
  ): void;

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void;

  /**
   * Wrap a handler function with Rollbar error handling
   */
  withRollbar<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => TResult | Promise<TResult>;

  /**
   * Get Rollbar configuration from environment variables
   */
  getRollbarConfigFromEnv(): RollbarConfig | null;
}
