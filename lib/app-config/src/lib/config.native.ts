import Constants from 'expo-constants';
import type { AppConfig } from './types';
import { validateConfig } from './validation';

export function buildNativeConfig(): AppConfig {
  const extra = Constants.expoConfig?.extra as
    | Record<string, string | undefined>
    | undefined;

  return validateConfig({
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
  });
}

export const config: AppConfig = buildNativeConfig();
