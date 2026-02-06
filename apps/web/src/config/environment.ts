/**
 * Environment configuration module
 *
 * This module centralizes all environment variable access for easier testing
 * and better maintainability. All components should import from here instead
 * of accessing import.meta.env directly.
 */

export interface EnvironmentConfig {
  readonly oauthProxyUrl: string;
  readonly googleClientId: string;
  readonly graphqlUrl: string;
  readonly isDev: boolean;
  readonly authTestMode: boolean;
  readonly baseUrl: string;
  readonly appVersion: string;
  readonly commitSha: string;
  readonly buildDate: string;
  readonly sentryDsn?: string;
  readonly sentryTracesSampleRate?: number;
}

/**
 * Get the current environment configuration
 * Note: userManagerUrl removed - now using single secure OAuth lambda
 */
export const getEnvironmentConfig = (): EnvironmentConfig => ({
  oauthProxyUrl:
    (import.meta.env.VITE_OAUTH_PROXY_URL as string) || 'http://localhost:5001',
  googleClientId:
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
    'placeholder-google-client-id',
  graphqlUrl:
    (import.meta.env.VITE_GRAPHQL_HOST as string) ||
    'http://localhost:5000/graphql',
  isDev: import.meta.env.DEV === true,
  authTestMode: import.meta.env.VITE_AUTH_TEST_MODE === 'true',
  baseUrl: import.meta.env.BASE_URL || '/',
  appVersion: (import.meta.env.VITE_APP_VERSION as string) || 'unknown',
  commitSha: (import.meta.env.VITE_COMMIT_SHA as string) || 'unknown',
  buildDate: (import.meta.env.VITE_BUILD_DATE as string) || 'unknown',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  sentryTracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
    ? parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string)
    : 0.1,
});

/**
 * Singleton instance of environment config
 */
export const env = getEnvironmentConfig();
