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
  });
}

export const config: AppConfig = buildWebConfig();
