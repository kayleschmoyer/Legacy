/**
 * Node.js/Lambda Rollbar implementation
 * Uses the rollbar npm package for server-side error tracking
 */

import Rollbar from 'rollbar';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import {
  RollbarBreadcrumb,
  RollbarConfig,
  RollbarInterface,
  RollbarSeverity,
} from './types';
import { RollbarOutputDestination } from './RollbarOutputDestination';
import { sanitizeContext } from './sanitize-context';

/** Maximum number of breadcrumbs retained in memory. Oldest entries are dropped when the buffer is full. */
const MAX_BREADCRUMBS = 100;

class NodeRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  /** In-memory breadcrumb log (Rollbar telemetry handles this internally but we keep compat). */
  private breadcrumbs: RollbarBreadcrumb[] = [];
  private rollbarDestination: RollbarOutputDestination | null = null;
  /** Errors already reported to Rollbar — used by withRollbar to skip double-reporting. */
  private reportedErrors = new WeakSet<Error>();

  init(config: RollbarConfig): void {
    // When the access token is provided directly, initialize synchronously.
    // Otherwise kick off an async fetch from AWS Secrets Manager and finish
    // initialization once the token resolves. Errors captured before the
    // secret resolves are logged by LOGGER and dropped by the `!this.rollbar`
    // guard in captureError — acceptable for cold-start given the alternative
    // (plaintext tokens in Lambda env vars) fails the security review (LS-2790).
    if (config.accessToken) {
      this.initWithToken(config, config.accessToken);
      return;
    }
    if (config.accessTokenSecretName) {
      void this.initFromSecret(config);
      return;
    }
    LOGGER.warn(
      'Rollbar not initialized: no access token or secret name provided',
    );
  }

  private async initFromSecret(config: RollbarConfig): Promise<void> {
    if (!config.accessTokenSecretName) return;
    try {
      const accessToken = await retrieveSecretParameterValue(
        config.accessTokenSecretName,
      );
      this.initWithToken(config, accessToken);
    } catch (error) {
      LOGGER.error(
        'Failed to fetch Rollbar access token from Secrets Manager',
        error instanceof Error ? error : new Error(String(error)),
        { secretName: config.accessTokenSecretName },
      );
    }
  }

  private initWithToken(config: RollbarConfig, accessToken: string): void {
    try {
      this.rollbar = new Rollbar({
        accessToken,
        environment: config.environment,
        // Default to false: our global handlers in lib/logging/server.ts already forward
        // uncaught errors via LOGGER.error → RollbarOutputDestination. Letting
        // Rollbar's own hooks run too caused triple-reporting (LS-1948).
        captureUncaught: config.captureUncaught ?? false,
        captureUnhandledRejections: config.captureUnhandledRejections ?? false,
        verbose: config.verbose ?? false,
        maxItems: config.maxItems ?? 50,
        itemsPerMinute: config.itemsPerMinute ?? 25,
        payload: {
          code_version: config.release,
        },
      });
      LOGGER.info('Rollbar initialized for Node.js environment', {
        environment: config.environment,
        accessToken: accessToken ? 'SET' : 'NOT_SET',
        release: config.release ?? 'NOT_SET',
      });

      // Route all LOGGER.error / LOGGER.fatal calls to Rollbar automatically.
      if (this.rollbarDestination) {
        LOGGER.removeDestination(this.rollbarDestination);
      }
      this.rollbarDestination = new RollbarOutputDestination(
        this.captureError.bind(this),
      );
      LOGGER.addDestination(this.rollbarDestination);
    } catch (error) {
      LOGGER.error(
        'Failed to initialize Rollbar',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  captureError(
    error: Error,
    context?: Record<string, unknown>,
    severity: RollbarSeverity = 'error',
  ): void {
    try {
      if (!this.rollbar) {
        LOGGER.warn('Rollbar not initialized, skipping error capture', {
          error: error.message,
        });
        return;
      }
      const safeContext = context ? sanitizeContext(context) : undefined;
      const breadcrumbContext =
        this.breadcrumbs.length > 0
          ? { breadcrumbs: this.breadcrumbs.slice() }
          : {};
      this.breadcrumbs = [];
      const payload = {
        ...breadcrumbContext,
        ...(safeContext ?? {}),
      };
      switch (severity) {
        case 'warning':
          this.rollbar.warning(error, payload);
          break;
        case 'info':
          this.rollbar.info(error, payload);
          break;
        default:
          this.rollbar.error(error, payload);
      }
      this.reportedErrors.add(error);
    } catch (captureError) {
      LOGGER.error(
        'Failed to capture error in Rollbar',
        captureError instanceof Error
          ? captureError
          : new Error(String(captureError)),
      );
      LOGGER.error('Original error was:', error);
    }
  }

  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void {
    // Buffer breadcrumbs locally; they are attached to the next captureError call.
    // Do NOT call rollbar.log() here — each log() counts as a rated item and
    // causes "item per minute limit reached" when breadcrumbs are added frequently.
    // Ring buffer: drop the oldest entry when the cap is reached to prevent
    // unbounded memory growth in long-running Lambdas or web sessions (LS-939).
    if (this.breadcrumbs.length >= MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
    this.breadcrumbs.push(breadcrumb);
  }

  withRollbar<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => TResult | Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      try {
        const result = await handler(...args);
        return result;
      } catch (error) {
        if (error instanceof Error) {
          if (!this.reportedErrors.has(error)) {
            this.captureError(error, {
              handler: handler.name,
              args: args.length,
            });
          }
        } else {
          LOGGER.error(
            'withRollbar caught non-Error value',
            new Error(String(error)),
            {
              handler: handler.name,
              args: args.length,
            },
          );
        }
        throw error;
      }
    };
  }

  getRollbarConfigFromEnv(): RollbarConfig | null {
    // Prefer a direct access token (local dev, tests) over the Secrets Manager
    // lookup path (Lambda runtime). `ROLLBAR_ACCESS_TOKEN_SECRET_NAME` points
    // at an AWS Secrets Manager secret whose value is fetched at cold-start,
    // so the token does not need to be stored directly in Lambda env vars or
    // exposed via Lambda GetFunctionConfiguration output (LS-2790).
    const accessToken = process.env['ROLLBAR_ACCESS_TOKEN'];
    const accessTokenSecretName =
      process.env['ROLLBAR_ACCESS_TOKEN_SECRET_NAME'];
    const environment =
      process.env['ROLLBAR_ENVIRONMENT'] ||
      process.env['NODE_ENV'] ||
      'development';

    if (!accessToken && !accessTokenSecretName) {
      LOGGER.warn(
        'Neither ROLLBAR_ACCESS_TOKEN nor ROLLBAR_ACCESS_TOKEN_SECRET_NAME set, Rollbar will not be initialized',
      );
      return null;
    }

    const release =
      process.env['ROLLBAR_RELEASE'] ||
      process.env['APP_VERSION'] ||
      process.env['COMMIT_SHA'] ||
      undefined;

    return {
      accessToken: accessToken ?? '',
      accessTokenSecretName,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      verbose: process.env['ROLLBAR_VERBOSE'] === 'true',
      release,
    };
  }
}

// Export singleton instance
export const rollbar = new NodeRollbarImplementation();
