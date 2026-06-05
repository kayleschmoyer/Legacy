// Mutable extra object — tests that need to omit native-required keys can
// temporarily reassign mockExtraData before calling buildNativeConfig().
let mockExtraData: Record<string, string | undefined> = {
  statsApiUrl: 'http://stats-from-extra.com',
  rollbarToken: 'rollbar-from-extra',
  // Native-required keys must be present in the default mock so tests
  // that call buildNativeConfig() without setting env vars don't throw.
  graphqlHost: 'https://api-from-extra.com/graphql',
  oauthProxy: 'https://oauth-from-extra.com',
  googleClientId: 'google-client-from-extra',
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { extra: mockExtraData } };
  },
}));

import { buildNativeConfig } from './config.native';

describe('native adapter', () => {
  const originalEnv = process.env;
  const defaultMockExtra = { ...mockExtraData };

  afterEach(() => {
    process.env = originalEnv;
    mockExtraData = { ...defaultMockExtra };
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all EXPO_PUBLIC_* vars between tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('EXPO_PUBLIC_')) {
        delete process.env[key];
      }
    }
  });

  it('reads statsApiUrl from EXPO_PUBLIC_STATS_API_URL (AC3: literal static read)', () => {
    process.env.EXPO_PUBLIC_STATS_API_URL = 'http://stats.example.com';
    expect(buildNativeConfig().statsApiUrl).toBe('http://stats.example.com');
  });

  it('reads websocketUrl from EXPO_PUBLIC_WEBSOCKET_URL', () => {
    process.env.EXPO_PUBLIC_WEBSOCKET_URL = 'wss://ws.example.com';
    expect(buildNativeConfig().websocketUrl).toBe('wss://ws.example.com');
  });

  it('reads oauthProxy from EXPO_PUBLIC_OAUTH_PROXY', () => {
    process.env.EXPO_PUBLIC_OAUTH_PROXY = 'https://oauth.example.com';
    expect(buildNativeConfig().oauthProxy).toBe('https://oauth.example.com');
  });

  it('reads googleClientId from EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID', () => {
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'google-client-123';
    expect(buildNativeConfig().googleClientId).toBe('google-client-123');
  });

  it('reads graphqlHost from EXPO_PUBLIC_GRAPHQL_HOST', () => {
    process.env.EXPO_PUBLIC_GRAPHQL_HOST = 'https://api.example.com/graphql';
    expect(buildNativeConfig().graphqlHost).toBe(
      'https://api.example.com/graphql',
    );
  });

  it('falls back to Constants.expoConfig.extra when env var is absent', () => {
    // No EXPO_PUBLIC_STATS_API_URL set — should fall back to extra
    expect(buildNativeConfig().statsApiUrl).toBe('http://stats-from-extra.com');
  });

  it('prefers env var over Constants.expoConfig.extra', () => {
    process.env.EXPO_PUBLIC_STATS_API_URL = 'http://env-wins.com';
    expect(buildNativeConfig().statsApiUrl).toBe('http://env-wins.com');
  });

  it('reads appVersion from EXPO_PUBLIC_APP_VERSION', () => {
    process.env.EXPO_PUBLIC_APP_VERSION = '1.2.3';
    expect(buildNativeConfig().appVersion).toBe('1.2.3');
  });

  it('reads commitSha from EXPO_PUBLIC_COMMIT_SHA', () => {
    process.env.EXPO_PUBLIC_COMMIT_SHA = 'abc1234';
    expect(buildNativeConfig().commitSha).toBe('abc1234');
  });

  it('reads buildDate from EXPO_PUBLIC_BUILD_DATE', () => {
    process.env.EXPO_PUBLIC_BUILD_DATE = '2026-06-03T00:00:00Z';
    expect(buildNativeConfig().buildDate).toBe('2026-06-03T00:00:00Z');
  });

  it('falls back to extra for appVersion/commitSha/buildDate', () => {
    // No EXPO_PUBLIC_* set — the mock has no extra for these keys so undefined
    expect(buildNativeConfig().appVersion).toBeUndefined();
    expect(buildNativeConfig().commitSha).toBeUndefined();
    expect(buildNativeConfig().buildDate).toBeUndefined();
  });

  it('reads repoUrl from EXPO_PUBLIC_REPO_URL (LS-7590 / GAP-002)', () => {
    process.env.EXPO_PUBLIC_REPO_URL = 'https://github.com/example/repo';
    expect(buildNativeConfig().repoUrl).toBe('https://github.com/example/repo');
  });

  it('falls back to extra.repoUrl when EXPO_PUBLIC_REPO_URL is absent', () => {
    mockExtraData = {
      ...defaultMockExtra,
      repoUrl: 'https://github.com/fallback/repo',
    };
    expect(buildNativeConfig().repoUrl).toBe(
      'https://github.com/fallback/repo',
    );
  });

  it('returns undefined for keys absent from both env and extra', () => {
    const cfg = buildNativeConfig();
    expect(cfg.websocketUrl).toBeUndefined();
    expect(cfg.giphyApiKey).toBeUndefined();
    expect(cfg.appBaseUrl).toBeUndefined();
    expect(cfg.repoUrl).toBeUndefined();
  });

  it('does not throw when native-required keys are provided via extra', () => {
    // The default mock provides graphqlHost, oauthProxy, googleClientId via extra
    expect(() => buildNativeConfig()).not.toThrow();
  });

  describe('native-required key validation (LS-7701)', () => {
    it('throws when graphqlHost is absent from both env and extra', () => {
      mockExtraData = {
        oauthProxy: 'https://oauth.example.com',
        googleClientId: 'gid',
      };
      expect(() => buildNativeConfig()).toThrow(
        'required native keys are not configured',
      );
      expect(() => buildNativeConfig()).toThrow(/graphqlHost/);
    });

    it('lists all missing native-required keys in one error', () => {
      mockExtraData = {};
      expect(() => buildNativeConfig()).toThrow(
        'required native keys are not configured',
      );
      expect(() => buildNativeConfig()).toThrow(/graphqlHost/);
      expect(() => buildNativeConfig()).toThrow(/oauthProxy/);
      expect(() => buildNativeConfig()).toThrow(/googleClientId/);
    });
  });
});
