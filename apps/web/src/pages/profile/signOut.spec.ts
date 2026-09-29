import { signOut } from './signOut';

const mockLoggerError = jest.fn<void, unknown[]>();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

describe('signOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls auth.logout when available', () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    signOut({ logout });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs an error when auth.logout is missing', () => {
    signOut({});
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Sign out failed: auth.logout is not available',
    );
  });

  it('logs an error when logout rejects', async () => {
    const failure = new Error('boom');
    const logout = jest.fn().mockRejectedValue(failure);
    signOut({ logout });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockLoggerError).toHaveBeenCalledWith('Sign out failed:', failure);
  });

  it('logs an error when logout throws synchronously', () => {
    const failure = new Error('sync');
    const logout = jest.fn(() => {
      throw failure;
    });
    signOut({ logout });
    expect(mockLoggerError).toHaveBeenCalledWith('Sign out failed:', failure);
  });
});
