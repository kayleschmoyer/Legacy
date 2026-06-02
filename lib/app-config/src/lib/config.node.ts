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
    environmentName: undefined,
    authTestMode: undefined,
    discordClientId: undefined,
    appVersion: undefined,
    commitSha: undefined,
    buildDate: undefined,
    branch: undefined,
    rollbarCaptureRate: undefined,
    googleAnalyticsMeasurementId: undefined,
    jiraProxyUrl: undefined,
    stripeMonthlyPriceId: undefined,
    stripeAnnualPriceId: undefined,
    vapidPublicKey: undefined,
    imageUploadUrl: undefined,
    repoUrl: undefined,
  });
}

export const config: AppConfig = buildNodeConfig();
