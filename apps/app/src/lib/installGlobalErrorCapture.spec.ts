import { installGlobalErrorCapture } from './installGlobalErrorCapture';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

// Minimal ErrorUtils shim — React Native globals aren't available in Jest.
const mockSetGlobalHandler = jest.fn();
const mockGetGlobalHandler = jest.fn();

(global as Record<string, unknown>).ErrorUtils = {
  setGlobalHandler: mockSetGlobalHandler,
  getGlobalHandler: mockGetGlobalHandler,
};

describe('installGlobalErrorCapture', () => {
  let capturedHandler: (error: unknown, isFatal?: boolean) => void;
  let mockLoggerError: jest.Mock;
  const prevHandler = jest.fn();

  beforeEach(() => {
    // Access via requireMock to avoid triggering unbound-method on the module import.
    const mockedLogging = jest.requireMock(
      '@legacy-sports/logging',
    ) as unknown as {
      LOGGER: { error: jest.Mock };
    };
    mockLoggerError = mockedLogging.LOGGER.error;

    jest.clearAllMocks();
    mockGetGlobalHandler.mockReturnValue(prevHandler);
    mockSetGlobalHandler.mockImplementation((handler) => {
      capturedHandler = handler as (error: unknown, isFatal?: boolean) => void;
    });
    installGlobalErrorCapture();
  });

  it('registers a global handler via ErrorUtils.setGlobalHandler', () => {
    expect(mockSetGlobalHandler).toHaveBeenCalledTimes(1);
    expect(typeof capturedHandler).toBe('function');
  });

  it('logs an Error instance directly to LOGGER.error', () => {
    const err = new Error('boom');
    capturedHandler(err, false);
    expect(mockLoggerError).toHaveBeenCalledWith('Uncaught JS error', err, {
      isFatal: false,
    });
  });

  it('wraps a non-Error thrown value in new Error', () => {
    capturedHandler('string error', true);
    const calls = mockLoggerError.mock.calls as [string, Error, object][];
    const logged = calls[0]?.[1];
    expect(logged).toBeInstanceOf(Error);
    expect(logged?.message).toBe('string error');
    expect(mockLoggerError).toHaveBeenCalledWith('Uncaught JS error', logged, {
      isFatal: true,
    });
  });

  it('defaults isFatal to false when undefined', () => {
    capturedHandler(new Error('x'));
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Uncaught JS error',
      expect.any(Error),
      { isFatal: false },
    );
  });

  it('chains the previous handler only in __DEV__', () => {
    const err = new Error('dev');
    // __DEV__ is true in the Jest RN environment
    capturedHandler(err, false);
    expect(prevHandler).toHaveBeenCalledWith(err, false);
  });
});
