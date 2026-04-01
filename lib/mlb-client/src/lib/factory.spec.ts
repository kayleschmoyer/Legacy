/**
 * Unit tests for createMlbDataProvider factory (LS-1864).
 *
 * Covers:
 *   - returns MlbStatsApiProvider for 'mlb-statsapi'
 *   - returns BallDontLieProvider for 'balldontlie' with API key
 *   - reads provider from MLB_DATA_PROVIDER env var
 *   - defaults to 'mlb-statsapi' when env var is not set
 *   - runtime guard throws in production with mlb-statsapi
 *   - runtime guard allows mlb-statsapi in non-production
 *   - throws for unknown provider
 *   - throws when paid provider has no API key
 */

import { createMlbDataProvider } from './factory';
import type { MlbProviderName } from './factory';
import { MlbStatsApiProvider } from './providers/mlb-statsapi';
import { BallDontLieProvider } from './providers/balldontlie';

describe('createMlbDataProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['MLB_DATA_PROVIDER'];
    delete process.env['MLB_DATA_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Provider selection ─────────────────────────────────────────────────────

  it('returns MlbStatsApiProvider when provider is mlb-statsapi', () => {
    const provider = createMlbDataProvider({
      provider: 'mlb-statsapi',
      nodeEnv: 'development',
    });
    expect(provider).toBeInstanceOf(MlbStatsApiProvider);
  });

  it('returns BallDontLieProvider when provider is balldontlie with API key', () => {
    const provider = createMlbDataProvider({
      provider: 'balldontlie',
      apiKey: 'test-api-key',
      nodeEnv: 'production',
    });
    expect(provider).toBeInstanceOf(BallDontLieProvider);
  });

  it('throws when provider is rolling-insights (not yet implemented)', () => {
    expect(() =>
      createMlbDataProvider({
        provider: 'rolling-insights',
        apiKey: 'test-api-key',
        nodeEnv: 'production',
      }),
    ).toThrow('rolling-insights provider is not yet implemented');
  });

  // ── Environment variable resolution ───────────────────────────────────────

  it('reads provider from MLB_DATA_PROVIDER env var', () => {
    process.env['MLB_DATA_PROVIDER'] = 'mlb-statsapi';
    const provider = createMlbDataProvider({ nodeEnv: 'development' });
    expect(provider).toBeInstanceOf(MlbStatsApiProvider);
  });

  it('defaults to mlb-statsapi when MLB_DATA_PROVIDER is not set', () => {
    const provider = createMlbDataProvider({ nodeEnv: 'development' });
    expect(provider).toBeInstanceOf(MlbStatsApiProvider);
  });

  it('reads API key from MLB_DATA_API_KEY env var for paid providers', () => {
    process.env['MLB_DATA_API_KEY'] = 'env-api-key';
    expect(() =>
      createMlbDataProvider({
        provider: 'balldontlie',
        nodeEnv: 'production',
      }),
    ).not.toThrow();
  });

  // ── Runtime guard (production safety) ─────────────────────────────────────

  it('throws if mlb-statsapi is used in production', () => {
    expect(() =>
      createMlbDataProvider({
        provider: 'mlb-statsapi',
        nodeEnv: 'production',
      }),
    ).toThrow('statsapi.mlb.com is NOT licensed for commercial use');
  });

  it('allows mlb-statsapi in development', () => {
    expect(() =>
      createMlbDataProvider({
        provider: 'mlb-statsapi',
        nodeEnv: 'development',
      }),
    ).not.toThrow();
  });

  it('allows mlb-statsapi in test environment', () => {
    expect(() =>
      createMlbDataProvider({ provider: 'mlb-statsapi', nodeEnv: 'test' }),
    ).not.toThrow();
  });

  // ── Error cases ────────────────────────────────────────────────────────────

  it('throws for unknown provider name', () => {
    expect(() =>
      createMlbDataProvider({
        provider: 'unknown-provider' as unknown as MlbProviderName,
        nodeEnv: 'development',
      }),
    ).toThrow('Unknown MLB_DATA_PROVIDER');
  });

  it('throws when paid provider has no API key', () => {
    expect(() =>
      createMlbDataProvider({
        provider: 'balldontlie',
        apiKey: '',
        nodeEnv: 'production',
      }),
    ).toThrow('MLB_DATA_API_KEY is required');
  });
});
