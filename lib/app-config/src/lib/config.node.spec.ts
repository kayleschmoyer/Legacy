jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarOptional: jest.fn().mockImplementation((key: string) => {
    const env: Record<string, string | undefined> = {
      ROLLBAR_ACCESS_TOKEN: 'test-rollbar-token',
      CLIENT_ID: 'test-google-client-id',
    };
    return env[key];
  }),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest
    .fn()
    .mockResolvedValue('secret-rollbar-token'),
}));

import { buildNodeConfig, config, initNodeConfig } from './config.node';

describe('node adapter', () => {
  it('reads rollbarToken from ROLLBAR_ACCESS_TOKEN', () => {
    expect(buildNodeConfig().rollbarToken).toBe('test-rollbar-token');
  });

  it('reads googleClientId from CLIENT_ID', () => {
    expect(buildNodeConfig().googleClientId).toBe('test-google-client-id');
  });

  it('returns undefined for client-only keys (no node env var)', () => {
    const cfg = buildNodeConfig();
    expect(cfg.statsApiUrl).toBeUndefined();
    expect(cfg.websocketUrl).toBeUndefined();
    expect(cfg.giphyApiKey).toBeUndefined();
    expect(cfg.growthbookClientKey).toBeUndefined();
    expect(cfg.oauthProxy).toBeUndefined();
    expect(cfg.graphqlHost).toBeUndefined();
    expect(cfg.appBaseUrl).toBeUndefined();
  });

  it('default (node) sub-path export re-exports config and buildNodeConfig (AC1)', () => {
    // src/index.ts is the default entry-point (tsconfig.base.json paths:
    //   "@legacy-sports/app-config" → "lib/app-config/src/index.ts")
    // It must re-export exactly the node adapter symbols so jest (node) gets
    // the correct adapter without any bundler-condition magic.
    const indexExports = require('../index');
    expect(indexExports).toHaveProperty('config');
    expect(indexExports).toHaveProperty('buildNodeConfig');
    expect(indexExports).toHaveProperty('initNodeConfig');
    // Confirm it is the NODE adapter (not native — native also has buildNativeConfig)
    expect(indexExports).not.toHaveProperty('buildNativeConfig');
  });

  describe('initNodeConfig', () => {
    afterEach(() => {
      // Reset the mutable config back to env-var values after each test
      const fresh = buildNodeConfig();
      Object.assign(config, fresh);
    });

    it('resolves a secret-backed key from Secrets Manager', async () => {
      const {
        retrieveSecretParameterValue,
      } = require('@legacy-sports/aws-utils');
      (retrieveSecretParameterValue as jest.Mock).mockResolvedValueOnce(
        'resolved-from-secret',
      );

      await initNodeConfig({ secrets: { rollbarToken: 'my-secret-name' } });

      expect(config.rollbarToken).toBe('resolved-from-secret');
      expect(retrieveSecretParameterValue).toHaveBeenCalledWith(
        'my-secret-name',
      );
    });

    it('is a no-op when no secrets option is provided', async () => {
      const before = config.rollbarToken;
      await initNodeConfig();
      expect(config.rollbarToken).toBe(before);
    });

    it('logs an error and keeps the existing value when Secrets Manager fetch fails', async () => {
      const {
        retrieveSecretParameterValue,
      } = require('@legacy-sports/aws-utils');
      (retrieveSecretParameterValue as jest.Mock).mockRejectedValueOnce(
        new Error('Secrets Manager unavailable'),
      );

      const before = config.rollbarToken;
      await initNodeConfig({ secrets: { rollbarToken: 'failing-secret' } });

      // Value unchanged after fetch failure
      expect(config.rollbarToken).toBe(before);
    });
  });
});
