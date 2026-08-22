import { handleError } from './ErrorHandler';

// Declare standalone jest.fn() variables before jest.mock() factories.
// The factory closures capture these by reference, so they are properly
// initialized as jest.Mock instances by the time any test runs.
const mockLoggerError = jest.fn();
const mockAlertAlert = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): unknown => mockLoggerError(...args),
  },
}));

jest.mock('react-native', () => ({
  Alert: {
    alert: (...args: unknown[]): unknown => mockAlertAlert(...args),
  },
}));

describe('handleError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the specific error message, not a generic label', () => {
    const err = new Error(
      'Player is locked — the matchup for the current week has already started',
    );

    handleError(err);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Player is locked — the matchup for the current week has already started',
      err,
    );
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

  it('shows the specific message to the user via Alert', () => {
    handleError(new Error('boom'));

    expect(mockAlertAlert).toHaveBeenCalledWith('Error', 'boom');
  });

  it('does not double-report to Rollbar via a separate captureError call', () => {
    handleError(new Error('boom'));

    // Only LOGGER.error should run — RollbarOutputDestination forwards it to
    // Rollbar automatically, so a second explicit capture would duplicate it.
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});
