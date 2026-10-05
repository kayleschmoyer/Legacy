import Constants from 'expo-constants';
import type { AppConfig } from './types';
import { CONFIG_KEYS } from './registry';
import { validateConfig } from './validation';

// Routes casts through `unknown` behind a generic function boundary.
// typescript-eslint's no-unnecessary-type-assertion false-positives on direct
// `x as T` casts from an `any`-valued source (e.g. expo-constants' `extra?:
// { [k: string]: any }`) — it treats the assertion as a no-op because `any`
// is already assignable to anything. Crossing a generic call breaks that
// analysis, matching the LS-8615 typescript-eslint v8 migration fix pattern.
function castUnknown<T>(value: unknown): T {
  return value as T;
}

export function buildNativeConfig(): AppConfig {
  const extra = castUnknown<Record<string, string | undefined> | undefined>(
    Constants.expoConfig?.extra,
  );

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
    discordClientId:
      process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID ?? extra?.['discordClientId'],
    // Web-only keys — not available on native
    environmentName: undefined,
    // Build-metadata keys — available on native via EXPO_PUBLIC_* (inlined by
    // babel-preset-expo) with extra fallback for backward compat (LS-7561).
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? extra?.['appVersion'],
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA ?? extra?.['commitSha'],
    buildDate: process.env.EXPO_PUBLIC_BUILD_DATE ?? extra?.['buildDate'],
    branch: undefined,
    rollbarCaptureRate: undefined,
    googleAnalyticsMeasurementId: undefined,
    jiraProxyUrl:
      process.env.EXPO_PUBLIC_JIRA_PROXY_URL ?? extra?.['jiraProxyUrl'],
    vapidPublicKey: undefined,
    // Native team-logo upload (LS-7685): mirrors repoUrl below.
    imageUploadUrl:
      process.env.EXPO_PUBLIC_IMAGE_UPLOAD_URL ?? extra?.['imageUploadUrl'],
    repoUrl: process.env.EXPO_PUBLIC_REPO_URL ?? extra?.['repoUrl'],
  };

  // Validate all native-required keys together so one error lists everything missing,
  // rather than surfacing one missing key at a time per consumer.
  const missingNative = castUnknown<
    [string, (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS]][]
  >(Object.entries(CONFIG_KEYS))
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

export function makeLazyConfig(): AppConfig {
  let _cache: AppConfig | undefined;
  return new Proxy({} as AppConfig, {
    get(_target, prop: string | symbol) {
      if (_cache === undefined) {
        _cache = buildNativeConfig();
      }
      return (_cache as Record<string | symbol, unknown>)[prop];
    },
  });
}

// Lazy: buildNativeConfig() runs on first property access, not at import time.
// Prevents a crash at module load when EXPO_PUBLIC_* vars are absent (LS-4970).
export const config: AppConfig = makeLazyConfig();
