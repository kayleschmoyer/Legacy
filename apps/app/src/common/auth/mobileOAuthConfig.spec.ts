import {
  DEFAULT_GOOGLE_CLIENT_ID,
  getMobileOAuthConfig,
  PLACEHOLDER_GOOGLE_CLIENT_ID,
  resolveGoogleClientId,
} from './mobileOAuthConfig';

// Control config values via the native adapter mock.
const mockConfig: Record<string, string | undefined> = {};
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return mockConfig;
  },
}));

function setConfig(values: Record<string, string | undefined>): void {
  Object.keys(mockConfig).forEach((k) => {
    delete mockConfig[k];
  });
  Object.assign(mockConfig, values);
}

describe('mobileOAuthConfig', () => {
  beforeEach(() => {
    setConfig({});
  });

  describe('getMobileOAuthConfig oauthProxyUrl', () => {
    it('returns config.oauthProxy as oauthProxyUrl', () => {
      setConfig({ oauthProxy: 'https://api.example.com/dev/oauth' });
      expect(getMobileOAuthConfig().oauthProxyUrl).toBe(
        'https://api.example.com/dev/oauth',
      );
    });

    it('returns undefined when oauthProxy is not set', () => {
      expect(getMobileOAuthConfig().oauthProxyUrl).toBeUndefined();
    });
  });

  describe('resolveGoogleClientId', () => {
    it('uses config.googleClientId when it is a real client id', () => {
      setConfig({
        googleClientId: 'real-client-id.apps.googleusercontent.com',
      });
      expect(resolveGoogleClientId()).toBe(
        'real-client-id.apps.googleusercontent.com',
      );
    });

    it('ignores the app.json placeholder and falls back to the project default', () => {
      setConfig({ googleClientId: PLACEHOLDER_GOOGLE_CLIENT_ID });
      expect(resolveGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    });

    it('falls back to the project default when googleClientId is unset', () => {
      expect(resolveGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    });
  });
});
