import { LOGGER } from '@legacy-sports/logging';
import { config } from './config.native';

// React Native injects __DEV__ globally (true in dev, false in release bundles).
declare const __DEV__: boolean;

/**
 * Resolve the stats API endpoint from config.statsApiUrl.
 *
 * The value is read from the native adapter which uses a static
 * `process.env.EXPO_PUBLIC_STATS_API_URL` access so `babel-preset-expo`
 * inlines the value into the release bundle from apps/app/.env (generated
 * by the with-expo-public-env config plugin, LS-6402).
 *
 * The localhost fallback is restricted to __DEV__. In a release build with no
 * configured value we fail loudly instead of silently hitting an unreachable
 * cleartext localhost URL.
 *
 * @param devFallbackUrl endpoint to use during local development
 * @throws if no value is configured in a release build
 */
export function resolveStatsApiUrl(devFallbackUrl: string): string {
  if (config.statsApiUrl) {
    return config.statsApiUrl;
  }

  if (__DEV__) {
    return devFallbackUrl;
  }

  LOGGER.error(
    'EXPO_PUBLIC_STATS_API_URL is not configured in this release build; cannot reach the stats API.',
  );
  throw new Error('Stats API URL is not configured.');
}
