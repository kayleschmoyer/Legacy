import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { MobileOAuthProvider } from './MobileOAuthProvider';

// Mock LOGGER to avoid console output in tests
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Self-contained mock so this spec runs correctly under both the web and
// mobile jest projects (only the mobile setup file mocks google-signin).
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(),
    signOut: jest.fn(() => Promise.resolve()),
    getCurrentUser: jest.fn(() => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

const mockedSignIn = GoogleSignin.signIn as jest.Mock;
const mockedHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;

describe('MobileOAuthProvider.signIn', () => {
  let provider: MobileOAuthProvider;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedHasPlayServices.mockResolvedValue(true);
    provider = new MobileOAuthProvider();
    await provider.configure({
      googleClientId: 'test-client-id',
      oauthProxyUrl: 'http://localhost:5001',
    });
  });

  // Regression: the @react-native-google-signin response nests serverAuthCode
  // and user under `.data` ({ type: 'success', data: User }). Reading them from
  // the top level left `code` undefined and made callSecureOAuth throw
  // "Invalid OAuth response - missing code or credential" on Android. (LS-5079)
  it('maps serverAuthCode from response.data into code (authorization-code flow)', async () => {
    mockedSignIn.mockResolvedValue({
      type: 'success',
      data: {
        serverAuthCode: 'auth-code-123',
        idToken: 'id-token',
        scopes: [],
        user: {
          id: 'user-1',
          email: 'fan@legacy-fantasy.com',
          name: 'Test Fan',
          photo: null,
          familyName: 'Fan',
          givenName: 'Test',
        },
      },
    });

    const response = await provider.signIn();

    expect(response.code).toBe('auth-code-123');
    expect(response.serverAuthCode).toBe('auth-code-123');
    expect(response.user).toEqual({
      id: 'user-1',
      email: 'fan@legacy-fantasy.com',
      name: 'Test Fan',
      photo: undefined,
    });
  });

  it('leaves code undefined when serverAuthCode is null', async () => {
    mockedSignIn.mockResolvedValue({
      type: 'success',
      data: {
        serverAuthCode: null,
        idToken: 'id-token',
        scopes: [],
        user: {
          id: 'user-1',
          email: 'fan@legacy-fantasy.com',
          name: 'Test Fan',
          photo: null,
          familyName: 'Fan',
          givenName: 'Test',
        },
      },
    });

    const response = await provider.signIn();

    expect(response.code).toBeUndefined();
    expect(response.serverAuthCode).toBeUndefined();
    expect(response.user?.id).toBe('user-1');
  });
});
