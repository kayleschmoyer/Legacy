import type { MlbDataProvider } from './provider';
import { MlbStatsApiProvider } from './providers/mlb-statsapi';
import { BallDontLieProvider } from './providers/balldontlie';

export type MlbProviderName =
  | 'mlb-statsapi'
  | 'balldontlie'
  | 'rolling-insights';

export interface MlbClientConfig {
  /** Provider identifier — defaults to MLB_DATA_PROVIDER env var. */
  provider?: MlbProviderName;
  /** API key for paid providers — defaults to MLB_DATA_API_KEY env var. */
  apiKey?: string;
  /** Override NODE_ENV check (for testing). */
  nodeEnv?: string;
}

/**
 * Factory that returns the configured MlbDataProvider.
 *
 * Provider selection order:
 *   1. config.provider argument
 *   2. MLB_DATA_PROVIDER environment variable
 *   3. Defaults to 'mlb-statsapi'
 *
 * Runtime guard: throws if 'mlb-statsapi' is used in production
 * (statsapi.mlb.com is not licensed for commercial use).
 */
export function createMlbDataProvider(
  config: MlbClientConfig = {},
): MlbDataProvider {
  const provider =
    config.provider ??
    (process.env['MLB_DATA_PROVIDER'] as MlbProviderName | undefined) ??
    'mlb-statsapi';

  const nodeEnv = config.nodeEnv ?? process.env['NODE_ENV'] ?? 'development';

  // Runtime guard: mlb-statsapi must never reach production
  if (provider === 'mlb-statsapi' && nodeEnv === 'production') {
    throw new Error(
      '[mlb-client] Cannot use mlb-statsapi in production — ' +
        'statsapi.mlb.com is NOT licensed for commercial use. ' +
        'Set MLB_DATA_PROVIDER to a licensed provider (balldontlie, rolling-insights).',
    );
  }

  switch (provider) {
    case 'mlb-statsapi':
      return new MlbStatsApiProvider();

    case 'balldontlie': {
      const apiKey = config.apiKey ?? process.env['MLB_DATA_API_KEY'] ?? '';
      return new BallDontLieProvider(apiKey);
    }

    case 'rolling-insights':
      throw new Error(
        '[mlb-client] rolling-insights provider is not yet implemented. ' +
          'Acquire the rolling-insights license to enable this provider.',
      );

    default:
      throw new Error(
        `[mlb-client] Unknown MLB_DATA_PROVIDER: "${String(provider)}". ` +
          'Must be one of: mlb-statsapi, balldontlie, rolling-insights.',
      );
  }
}
