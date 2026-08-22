import { handleError } from './ErrorHandler';

// Declare standalone jest.fn() variables before jest.mock() factories.
// The factory closures capture these by reference, so they are properly
// initialized as jest.Mock instances by the time any test runs.
const mockLoggerError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): unknown => mockLoggerError(...args),
  },
}));

describe('handleError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the specific error message, not a generic label', () => {
    const err = new Error('Player is locked');

    handleError(err);

    expect(mockLoggerError).toHaveBeenCalledWith('Player is locked', err);
  });

  it('synthesises an Error carrying the message when given a non-Error value', () => {
    handleError('some string error');

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [message, errorArg] = mockLoggerError.mock.calls[0] as [
      string,
      Error,
    ];
    expect(message).toBe('some string error');
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe('some string error');
  });

  it('falls back to a generic message for a truly unknown error value', () => {
    handleError({ unexpected: true });

    const [message, errorArg] = mockLoggerError.mock.calls[0] as [
      string,
      Error,
    ];
    expect(message).toBe('An unknown error occurred');
    expect(errorArg.message).toBe('An unknown error occurred');
  });
});
