import { LOGGER } from '@legacy-sports/logging';
import { AuthService, AuthSessionExpiredError } from './AuthService';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

const testConfig = {
  googleClientId: 'test-client-id',
  oauthProxyUrl: 'http://localhost:5001',
};

describe('AuthService.refreshJwt', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(testConfig);
  });

  it('swallows "Failed to fetch" network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new TypeError('Failed to fetch'), {}));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('swallows Firefox network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError('NetworkError when attempting to fetch resource.'),
      );

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('swallows React Native network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('logs unexpected errors at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('Unexpected JSON parse failure'));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(1);
    expect(mockLogger.error.mock.calls[0][0]).toBe(
      'AuthService: JWT refresh request failed:',
    );
    expect(mockLogger.error.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('re-throws AuthSessionExpiredError on 401 without logging', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(service.refreshJwt()).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    );
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('re-throws AuthSessionExpiredError on 403 without logging', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(service.refreshJwt()).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    );
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});
