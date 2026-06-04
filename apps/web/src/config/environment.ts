/**
 * Environment configuration module
 *
 * Reads all VITE_* values from @legacy-sports/app-config (which centralises
 * static import.meta.env reads so they are always inlinable at build time).
 * Only non-VITE_ Vite built-ins (import.meta.env.DEV, BASE_URL) are read here.
 */
import { config } from '@legacy-sports/app-config/web';

export interface EnvironmentConfig {
  readonly oauthProxyUrl: string;
  readonly googleClientId: string;
  /** Discord OAuth Application Client ID (optional — enables Discord login button) */
  readonly discordClientId?: string;
  readonly graphqlUrl: string;
  readonly websocketUrl: string;
  readonly isDev: boolean;
  /** Resolved environment name: VITE_ENVIRONMENT_NAME if set, else 'development' or 'production'. */
  readonly environmentName: string;
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
  /** Giphy API key for GIF search. */
  readonly giphyApiKey?: string;
  /** Base URL for image upload service (VITE_IMAGE_UPLOAD_URL). */
  readonly imageUploadUrl?: string;
  /** GitHub repository URL — overridable via VITE_REPO_URL if the org/repo is renamed. */
  readonly repoUrl: string;
}

/**
 * Get the current environment configuration.
 * VITE_* values come from the app-config singleton (statically inlined at build time).
 * Derived/computed fields are handled here.
 */
export const getEnvironmentConfig = (): EnvironmentConfig => ({
  oauthProxyUrl: config.oauthProxy ?? 'http://localhost:5001',
  googleClientId: config.googleClientId ?? 'placeholder-google-client-id',
  graphqlUrl: config.graphqlHost ?? 'http://localhost:5000/graphql',
  // In E2E tests, VITE_WEBSOCKET_URL is "" (not set at build time), which
  // causes esbuild to constant-fold `env.websocketUrl` to "" and dead-code-
  // eliminate the WebSocket connection guard in LeagueDetailPage.  The
  // window.__e2eWsUrl global (set via page.addInitScript before any scripts
  // run) is a runtime-only override that prevents constant folding.
  // Gated on navigator.webdriver so it only activates under automated
  // browsers (Playwright/Selenium) and is inert in normal production loads.
  websocketUrl:
    typeof window !== 'undefined' &&
    navigator.webdriver === true &&
    typeof window.__e2eWsUrl === 'string'
      ? window.__e2eWsUrl
      : (config.websocketUrl ?? ''),
  isDev: import.meta.env.DEV === true,
  environmentName:
    config.environmentName ??
    (import.meta.env.DEV === true ? 'development' : 'production'),
  authTestMode: config.authTestMode === 'true',
  baseUrl: import.meta.env.BASE_URL || '/',
  appVersion: config.appVersion ?? 'unknown',
  commitSha: config.commitSha ?? 'unknown',
  buildDate: config.buildDate ?? 'unknown',
  branch: config.branch ?? 'unknown',
  rollbarAccessToken: config.rollbarToken,
  rollbarCaptureRate: (() => {
    const raw = config.rollbarCaptureRate;
    if (!raw) return 1.0;
    const trimmed = raw.trim();
    if (trimmed === '') return 1.0;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return 1.0;
    return Math.min(1, Math.max(0, parsed));
  })(),
  googleAnalyticsMeasurementId: config.googleAnalyticsMeasurementId,
  // Same __e2e override pattern as websocketUrl — prevents Vite from
  // constant-folding the empty string and lets E2E tests inject a proxy URL.
  jiraProxyUrl:
    typeof window !== 'undefined' &&
    navigator.webdriver === true &&
    typeof window.__e2eJiraProxyUrl === 'string'
      ? window.__e2eJiraProxyUrl
      : import.meta.env.DEV && config.jiraProxyUrl
        ? '/__jira-proxy'
        : (config.jiraProxyUrl ?? ''),
  stripeMonthlyPriceId: config.stripeMonthlyPriceId ?? '',
  stripeAnnualPriceId: config.stripeAnnualPriceId ?? '',
  vapidPublicKey: config.vapidPublicKey ?? '',
  growthbookClientKey: config.growthbookClientKey,
  giphyApiKey: config.giphyApiKey,
  discordClientId: config.discordClientId,
  imageUploadUrl: config.imageUploadUrl,
  repoUrl: config.repoUrl ?? 'https://github.com/bkrupa/legacy-sports',
});

/**
 * Singleton instance of environment config
 */
export const env = getEnvironmentConfig();

const LOCALHOST_RE = /^https?:\/\/localhost/;

/**
 * Returns the names of VITE_* environment variables that are falling back to
 * localhost/placeholder defaults in a non-development runtime. An empty array
 * means the production config is healthy.
 */
export function getProductionConfigErrors(): readonly string[] {
  if (env.isDev) return [];
  const errors: string[] = [];
  if (LOCALHOST_RE.test(env.oauthProxyUrl)) errors.push('VITE_OAUTH_PROXY_URL');
  if (env.googleClientId.startsWith('placeholder-'))
    errors.push('VITE_GOOGLE_CLIENT_ID');
  if (LOCALHOST_RE.test(env.graphqlUrl)) errors.push('VITE_GRAPHQL_HOST');
  return errors;
}

/**
 * Config errors detected at module load time. Non-empty in production builds
 * where required VITE_* vars fell back to localhost/placeholder defaults,
 * meaning OAuth and GraphQL will not function correctly.
 */
export const envConfigErrors: readonly string[] = getProductionConfigErrors();
