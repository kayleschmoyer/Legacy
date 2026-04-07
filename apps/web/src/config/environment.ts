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
  /** Discord OAuth Application Client ID (optional — enables Discord login button) */
  readonly discordClientId?: string;
  readonly graphqlUrl: string;
  readonly websocketUrl: string;
  readonly isDev: boolean;
  readonly authTestMode: boolean;
  readonly baseUrl: string;
  readonly appVersion: string;
  readonly commitSha: string;
  readonly buildDate: string;
  readonly branch: string;
  readonly rollbarAccessToken?: string;
  readonly rollbarCaptureRate?: number;
  readonly googleAnalyticsMeasurementId?: string;
  /** URL for the Jira proxy lambda used by the bug report button. */
  readonly jiraProxyUrl: string;
  /** Stripe price ID for monthly Premium subscription. */
  readonly stripeMonthlyPriceId: string;
  /** Stripe price ID for annual Premium subscription. */
  readonly stripeAnnualPriceId: string;
  /** VAPID public key for Web Push subscription (base64url-encoded). */
  readonly vapidPublicKey: string;
  /** GrowthBook SDK client key for feature flags and A/B tests. */
  readonly growthbookClientKey?: string;
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
  websocketUrl: (import.meta.env.VITE_WEBSOCKET_URL as string) || '',
  isDev: import.meta.env.DEV === true,
  authTestMode: import.meta.env.VITE_AUTH_TEST_MODE === 'true',
  baseUrl: import.meta.env.BASE_URL || '/',
  appVersion:
    (import.meta.env.VITE_VERSION as string) ||
    (import.meta.env.VITE_APP_VERSION as string) ||
    'unknown',
  commitSha: (import.meta.env.VITE_COMMIT_SHA as string) || 'unknown',
  buildDate:
    (import.meta.env.VITE_BUILD_TIMESTAMP as string) ||
    (import.meta.env.VITE_BUILD_DATE as string) ||
    'unknown',
  branch: (import.meta.env.VITE_BRANCH as string) || 'unknown',
  rollbarAccessToken: import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN as
    | string
    | undefined,
  rollbarCaptureRate: (() => {
    const raw = import.meta.env.VITE_ROLLBAR_CAPTURE_RATE as string | undefined;
    if (!raw) return 1.0;
    const trimmed = raw.trim();
    if (trimmed === '') return 1.0;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return 1.0;
    return Math.min(1, Math.max(0, parsed));
  })(),
  googleAnalyticsMeasurementId: import.meta.env.VITE_GA_MEASUREMENT_ID as
    | string
    | undefined,
  jiraProxyUrl:
    import.meta.env.DEV && import.meta.env.VITE_JIRA_PROXY_URL
      ? '/__jira-proxy'
      : (import.meta.env.VITE_JIRA_PROXY_URL as string) || '',
  stripeMonthlyPriceId:
    (import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID as string) || '',
  stripeAnnualPriceId:
    (import.meta.env.VITE_STRIPE_ANNUAL_PRICE_ID as string) || '',
  vapidPublicKey: (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) || '',
  growthbookClientKey: import.meta.env.VITE_GROWTHBOOK_CLIENT_KEY as
    | string
    | undefined,
  discordClientId:
    (import.meta.env.VITE_DISCORD_CLIENT_ID as string) || undefined,
});

/**
 * Singleton instance of environment config
 */
export const env = getEnvironmentConfig();
