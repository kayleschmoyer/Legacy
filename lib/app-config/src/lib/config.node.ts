import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
import type { AppConfig, ConfigKey } from './types';
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
    googleClientId: getEnvVarOptional('CLIENT_ID'),
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

/**
 * Options for async Secrets-Manager-backed config resolution.
 * Mirror of the rollbar.node accessTokenSecretName pattern (LS-7560):
 * pass a map of logical-key → AWS Secrets Manager secret name; each is
 * fetched once at cold-start and written into the shared config object.
 */
export interface NodeConfigInitOptions {
  /**
   * Map of config key → AWS Secrets Manager secret name.
   * The secret value (a plain string) replaces the env-var-resolved value.
   * Keys not listed here retain their process.env values.
   */
  secrets?: Partial<Record<ConfigKey, string>>;
}

export const config: AppConfig = buildNodeConfig();

/**
 * Optionally resolve Secrets-Manager-backed values into the shared config.
 * Call once at Lambda cold-start before handling requests:
 *
 *   await initNodeConfig({ secrets: { rollbarToken: 'my-rollbar-secret-name' } });
 *
 * After this resolves, `config.rollbarToken` holds the secret value.
 * Keys not listed keep their process.env values.
 */
export async function initNodeConfig(
  options?: NodeConfigInitOptions,
): Promise<void> {
  if (!options?.secrets) return;

  // Import lazily so non-Lambda consumers (tests, CLI) do not pull in the
  // @aws-sdk/* bundle unless they explicitly call initNodeConfig with secrets.
  const { retrieveSecretParameterValue } =
    await import('@legacy-sports/aws-utils');

  for (const [key, secretName] of Object.entries(options.secrets) as [
    ConfigKey,
    string,
  ][]) {
    try {
      const value = await retrieveSecretParameterValue(secretName);
      (config as Record<string, string | undefined>)[key] = value;
    } catch (error) {
      LOGGER.error(
        `app-config: failed to resolve "${key}" from Secrets Manager secret "${secretName}"`,
        error instanceof Error ? error : new Error(String(error)),
        { secretName, configKey: key },
      );
    }
  }
}
