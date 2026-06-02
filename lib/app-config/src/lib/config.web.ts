/// <reference types="vite/client" />
import type { AppConfig } from './types';
import { validateConfig } from './validation';

export function buildWebConfig(): AppConfig {
  return validateConfig({
    statsApiUrl: import.meta.env['VITE_STATS_API_URL'] as string | undefined,
    websocketUrl: import.meta.env['VITE_WEBSOCKET_URL'] as string | undefined,
    rollbarToken: import.meta.env['VITE_ROLLBAR_ACCESS_TOKEN'] as
      | string
      | undefined,
    giphyApiKey: import.meta.env['VITE_GIPHY_API_KEY'] as string | undefined,
    growthbookClientKey: import.meta.env['VITE_GROWTHBOOK_CLIENT_KEY'] as
      | string
      | undefined,
    oauthProxy: import.meta.env['VITE_OAUTH_PROXY_URL'] as string | undefined,
    graphqlHost: import.meta.env['VITE_GRAPHQL_HOST'] as string | undefined,
    googleClientId: import.meta.env['VITE_GOOGLE_CLIENT_ID'] as
      | string
      | undefined,
    appBaseUrl: import.meta.env['VITE_APP_BASE_URL'] as string | undefined,
    environmentName: import.meta.env['VITE_ENVIRONMENT_NAME'] as
      | string
      | undefined,
    authTestMode: import.meta.env['VITE_AUTH_TEST_MODE'] as string | undefined,
    discordClientId: import.meta.env['VITE_DISCORD_CLIENT_ID'] as
      | string
      | undefined,
    appVersion: import.meta.env['VITE_APP_VERSION'] as string | undefined,
    commitSha: import.meta.env['VITE_COMMIT_SHA'] as string | undefined,
    buildDate: import.meta.env['VITE_BUILD_DATE'] as string | undefined,
    branch: import.meta.env['VITE_BRANCH'] as string | undefined,
    rollbarCaptureRate: import.meta.env['VITE_ROLLBAR_CAPTURE_RATE'] as
      | string
      | undefined,
    googleAnalyticsMeasurementId: import.meta.env['VITE_GA_MEASUREMENT_ID'] as
      | string
      | undefined,
    jiraProxyUrl: import.meta.env['VITE_JIRA_PROXY_URL'] as string | undefined,
    stripeMonthlyPriceId: import.meta.env['VITE_STRIPE_MONTHLY_PRICE_ID'] as
      | string
      | undefined,
    stripeAnnualPriceId: import.meta.env['VITE_STRIPE_ANNUAL_PRICE_ID'] as
      | string
      | undefined,
    vapidPublicKey: import.meta.env['VITE_VAPID_PUBLIC_KEY'] as
      | string
      | undefined,
    imageUploadUrl: import.meta.env['VITE_IMAGE_UPLOAD_URL'] as
      | string
      | undefined,
    repoUrl: import.meta.env['VITE_REPO_URL'] as string | undefined,
  });
}

export const config: AppConfig = buildWebConfig();
