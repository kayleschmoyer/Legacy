jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        statsApiUrl: 'http://stats-from-extra.com',
        rollbarToken: 'rollbar-from-extra',
      },
    },
  },
}));

import { buildNativeConfig } from './config.native';

describe('native adapter', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
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

  it('returns undefined for keys absent from both env and extra', () => {
    const cfg = buildNativeConfig();
    expect(cfg.websocketUrl).toBeUndefined();
    expect(cfg.giphyApiKey).toBeUndefined();
    expect(cfg.appBaseUrl).toBeUndefined();
  });

  it('does not throw when all keys are optional and some are missing', () => {
    expect(() => buildNativeConfig()).not.toThrow();
  });
});
