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
  /**
   * Build mode string as set at build time (e.g. "development", "production",
   * "staging", "preview", "test"). Sourced from `import.meta.env.MODE`. Use
   * this in user-facing diagnostic surfaces (e.g. /about) rather than the
   * binary `isDev` so non-prod deployments are correctly labelled. (LS-5709)
   *
   * Replaces the old `environmentName` field removed in LS-5709. No other
   * consumers reference `environmentName`; TypeScript enforces completeness.
   */
  readonly mode: string;
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
  // The production build no longer falls back to http://localhost:5001 when
  // VITE_OAUTH_PROXY_URL is unset (LS-4964 — that fallback was a MITM vector).
  // The hermetic E2E web build sets no proxy URL, so oauthProxyUrl would be ''
  // there, which breaks the Google sign-in exchange and hides the OAuth-gated
  // "Forgot password?" link. The window.__e2eOauthProxyUrl global (injected via
  // page.addInitScript before any app script runs) restores a deterministic
  // 'http://localhost:5001' for tests only — same runtime-override pattern as
  // websocketUrl / jiraProxyUrl below, gated on navigator.webdriver so it is
  // inert in normal production loads (LS-8011).
  oauthProxyUrl:
    typeof window !== 'undefined' &&
    navigator.webdriver === true &&
    typeof window.__e2eOauthProxyUrl === 'string'
      ? window.__e2eOauthProxyUrl
      : (config.oauthProxy ?? ''),
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
  mode: import.meta.env.MODE || 'unknown',
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
  // Same __e2e override pattern as websocketUrl/jiraProxyUrl — the E2E build
  // sets no VITE_GA_MEASUREMENT_ID, so tests that need to observe GA4 events
  // inject a deterministic ID via window.__e2eGaMeasurementId (LS-7628).
  googleAnalyticsMeasurementId:
    typeof window !== 'undefined' &&
    navigator.webdriver === true &&
    typeof window.__e2eGaMeasurementId === 'string'
      ? window.__e2eGaMeasurementId
      : config.googleAnalyticsMeasurementId,
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
  if (!env.oauthProxyUrl || LOCALHOST_RE.test(env.oauthProxyUrl))
    errors.push('VITE_OAUTH_PROXY_URL');
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
