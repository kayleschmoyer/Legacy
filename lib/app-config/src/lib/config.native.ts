import Constants from 'expo-constants';
import type { AppConfig } from './types';
import { CONFIG_KEYS } from './registry';
import { validateConfig } from './validation';

export function buildNativeConfig(): AppConfig {
  const extra = Constants.expoConfig?.extra as
    | Record<string, string | undefined>
    | undefined;

  const values = {
    statsApiUrl:
      process.env.EXPO_PUBLIC_STATS_API_URL ?? extra?.['statsApiUrl'],
    websocketUrl:
      process.env.EXPO_PUBLIC_WEBSOCKET_URL ?? extra?.['websocketUrl'],
    rollbarToken:
      process.env.EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN ?? extra?.['rollbarToken'],
    giphyApiKey:
      process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? extra?.['giphyApiKey'],
    growthbookClientKey:
      process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY ??
      extra?.['growthbookClientKey'],
    oauthProxy: process.env.EXPO_PUBLIC_OAUTH_PROXY ?? extra?.['oauthProxy'],
    graphqlHost: process.env.EXPO_PUBLIC_GRAPHQL_HOST ?? extra?.['graphqlHost'],
    googleClientId:
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ??
      extra?.['googleClientId'],
    appBaseUrl: process.env.EXPO_PUBLIC_APP_BASE_URL ?? extra?.['appBaseUrl'],
    // Web-only keys — not available on native
    environmentName: undefined,
    authTestMode: undefined,
    discordClientId: undefined,
    // Build-metadata keys — available on native via EXPO_PUBLIC_* (inlined by
    // babel-preset-expo) with extra fallback for backward compat (LS-7561).
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? extra?.['appVersion'],
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA ?? extra?.['commitSha'],
    buildDate: process.env.EXPO_PUBLIC_BUILD_DATE ?? extra?.['buildDate'],
    branch: undefined,
    rollbarCaptureRate: undefined,
    googleAnalyticsMeasurementId: undefined,
    jiraProxyUrl: undefined,
    stripeMonthlyPriceId: undefined,
    stripeAnnualPriceId: undefined,
    vapidPublicKey: undefined,
    imageUploadUrl: undefined,
    repoUrl: process.env.EXPO_PUBLIC_REPO_URL ?? extra?.['repoUrl'],
  };

  // Validate native-required keys up-front so the app fails loudly at startup
  // rather than when an individual consumer first tries to use a missing value.
  const missingNative = (
    Object.entries(CONFIG_KEYS) as [
      string,
      (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS],
    ][]
  )
    .filter(
      ([key, entry]) =>
        'nativeRequired' in entry &&
        entry.nativeRequired &&
        !values[key as keyof typeof values],
    )
    .map(([key]) => key);

  if (missingNative.length > 0) {
    throw new Error(
      `app-config: required native keys are not configured: ${missingNative.join(', ')}`,
    );
  }

  return validateConfig(values);
}

export const config: AppConfig = buildNativeConfig();
