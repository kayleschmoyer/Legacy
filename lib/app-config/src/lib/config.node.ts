import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import type { AppConfig } from './types';
import { validateConfig } from './validation';

export function buildNodeConfig(): AppConfig {
  return validateConfig({
    statsApiUrl: undefined,
    websocketUrl: undefined,
    rollbarToken: getEnvVarOptional('ROLLBAR_ACCESS_TOKEN'),
    giphyApiKey: undefined,
    growthbookClientKey: undefined,
    oauthProxy: undefined,
    graphqlHost: undefined,
    googleClientId: undefined,
    appBaseUrl: undefined,
  });
}

export const config: AppConfig = buildNodeConfig();
