jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarOptional: jest.fn().mockImplementation((key: string) => {
    const env: Record<string, string | undefined> = {
      ROLLBAR_ACCESS_TOKEN: 'test-rollbar-token',
    };
    return env[key];
  }),
}));

import { buildNodeConfig } from './config.node';

describe('node adapter', () => {
  it('reads rollbarToken from ROLLBAR_ACCESS_TOKEN', () => {
    expect(buildNodeConfig().rollbarToken).toBe('test-rollbar-token');
  });

  it('returns undefined for client-only keys (no node env var)', () => {
    const cfg = buildNodeConfig();
    expect(cfg.statsApiUrl).toBeUndefined();
    expect(cfg.websocketUrl).toBeUndefined();
    expect(cfg.giphyApiKey).toBeUndefined();
    expect(cfg.growthbookClientKey).toBeUndefined();
    expect(cfg.oauthProxy).toBeUndefined();
    expect(cfg.graphqlHost).toBeUndefined();
    expect(cfg.googleClientId).toBeUndefined();
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
    // Confirm it is the NODE adapter (not native — native also has buildNativeConfig)
    expect(indexExports).not.toHaveProperty('buildNativeConfig');
  });
});
