import Constants from 'expo-constants';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  DEFAULT_GOOGLE_CLIENT_ID,
  getMobileOAuthConfig,
  PLACEHOLDER_GOOGLE_CLIENT_ID,
  resolveGoogleClientId,
} from './mobileOAuthConfig';

// expo-constants pulls in native expo-modules-core which is unavailable in Jest.
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
  expoConfig: { extra: {} },
}));

// Mock the env reader so each test controls exactly what the dynamic
// `process.env` lookup returns, independent of the root `.env` Jest loads.
jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarOptional: jest.fn(),
}));

const mockedConstants = Constants as unknown as {
  expoConfig: { extra: Record<string, unknown> };
};
const mockedGetEnvVarOptional = getEnvVarOptional as jest.MockedFunction<
  typeof getEnvVarOptional
>;

function setExtra(extra: Record<string, unknown>): void {
  mockedConstants.expoConfig.extra = extra;
}

describe('mobileOAuthConfig', () => {
  beforeEach(() => {
    mockedGetEnvVarOptional.mockReset();
    mockedGetEnvVarOptional.mockReturnValue(undefined);
    setExtra({});
  });

  describe('getMobileOAuthConfig oauthProxyUrl', () => {
    it('falls back to extra.oauthProxyUrl when the env var is unset (release-bundle path)', () => {
      // In a release bundle the dynamic process.env read is undefined, so the
      // value embedded in extra by app.config.js is what must be used.
      setExtra({ oauthProxyUrl: 'https://api.example.com/dev/oauth' });

      expect(getMobileOAuthConfig().oauthProxyUrl).toBe(
        'https://api.example.com/dev/oauth',
      );
    });

    it('prefers the env var over extra when both are present', () => {
      mockedGetEnvVarOptional.mockReturnValue('https://env.example.com/oauth');
      setExtra({ oauthProxyUrl: 'https://extra.example.com/oauth' });

      expect(getMobileOAuthConfig().oauthProxyUrl).toBe(
        'https://env.example.com/oauth',
      );
    });

    it('falls back to the localhost default only when neither env nor extra is set', () => {
      expect(getMobileOAuthConfig().oauthProxyUrl).toBe(
        'http://localhost:5001/oauth',
      );
    });
  });

  describe('resolveGoogleClientId', () => {
    it('uses extra.googleClientId when it is a real client id', () => {
      setExtra({ googleClientId: 'real-client-id.apps.googleusercontent.com' });

      expect(resolveGoogleClientId()).toBe(
        'real-client-id.apps.googleusercontent.com',
      );
    });

    it('ignores the app.json placeholder and uses the project default', () => {
      setExtra({ googleClientId: PLACEHOLDER_GOOGLE_CLIENT_ID });

      expect(resolveGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    });

    it('prefers the env var over extra', () => {
      mockedGetEnvVarOptional.mockReturnValue(
        'env-client-id.apps.googleusercontent.com',
      );
      setExtra({
        googleClientId: 'extra-client-id.apps.googleusercontent.com',
      });

      expect(resolveGoogleClientId()).toBe(
        'env-client-id.apps.googleusercontent.com',
      );
    });
  });
});
