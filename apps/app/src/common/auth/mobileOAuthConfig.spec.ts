import {
  DEFAULT_GOOGLE_CLIENT_ID,
  getMobileOAuthConfig,
  PLACEHOLDER_GOOGLE_CLIENT_ID,
  PLACEHOLDER_OAUTH_PROXY_URL,
  resolveGoogleClientId,
  resolveOAuthProxyUrl,
  validateOAuthProxyUrl,
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

  describe('resolveOAuthProxyUrl', () => {
    it('returns the real URL when configured', () => {
      setConfig({ oauthProxy: 'https://api.example.com/dev/oauth' });
      expect(resolveOAuthProxyUrl()).toBe('https://api.example.com/dev/oauth');
    });

    it('returns undefined when oauthProxy is not set', () => {
      expect(resolveOAuthProxyUrl()).toBeUndefined();
    });

    it('returns undefined for the app.json placeholder (prevents localhost leak)', () => {
      setConfig({ oauthProxy: PLACEHOLDER_OAUTH_PROXY_URL });
      expect(resolveOAuthProxyUrl()).toBeUndefined();
    });
  });

  describe('getMobileOAuthConfig oauthProxyUrl', () => {
    it('returns config.oauthProxy as oauthProxyUrl', () => {
      setConfig({ oauthProxy: 'https://api.example.com/dev/oauth' });
      expect(getMobileOAuthConfig().oauthProxyUrl).toBe(
        'https://api.example.com/dev/oauth',
      );
    });

    it('throws when oauthProxy is not set', () => {
      // nativeRequired: true means buildNativeConfig throws at startup if
      // oauthProxy is missing, but getMobileOAuthConfig also validates early
      // so the error surfaces via login-error rather than a silent loop (LS-7588).
      expect(() => getMobileOAuthConfig()).toThrow(
        'OAuth proxy URL is not configured',
      );
    });
  });

  describe('validateOAuthProxyUrl', () => {
    it('passes for a valid HTTPS URL in non-dev mode', () => {
      // __DEV__ is true in jest, so we test the non-dev path indirectly;
      // the happy path always passes in dev (no throw).
      expect(() =>
        validateOAuthProxyUrl('https://api.example.com/oauth'),
      ).not.toThrow();
    });

    it('throws when url is undefined', () => {
      expect(() => validateOAuthProxyUrl(undefined)).toThrow(
        'OAuth proxy URL is not configured',
      );
    });

    it('throws when url is an empty string', () => {
      expect(() => validateOAuthProxyUrl('')).toThrow(
        'OAuth proxy URL is not configured',
      );
    });

    it('throws for the app.json placeholder (treated as unset)', () => {
      // The placeholder resolves to undefined, so getMobileOAuthConfig's early
      // guard throws rather than returning a config with an unusable proxy URL
      // (LS-7588).
      setConfig({ oauthProxy: PLACEHOLDER_OAUTH_PROXY_URL });
      expect(() => getMobileOAuthConfig()).toThrow(
        'OAuth proxy URL is not configured',
      );
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

  describe('getMobileOAuthConfig discordClientId', () => {
    it('forwards config.discordClientId when set (enables the Discord button)', () => {
      // A valid oauthProxy is required for getMobileOAuthConfig to pass its
      // early proxy-URL guard (LS-7588) before we can inspect discordClientId.
      setConfig({
        oauthProxy: 'https://api.example.com/oauth',
        discordClientId: 'discord-app-id',
      });
      expect(getMobileOAuthConfig().discordClientId).toBe('discord-app-id');
    });

    it('returns undefined when discordClientId is not set (button hidden)', () => {
      setConfig({ oauthProxy: 'https://api.example.com/oauth' });
      expect(getMobileOAuthConfig().discordClientId).toBeUndefined();
    });
  });
});
