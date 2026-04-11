import React from 'react';
import { render } from '@testing-library/react';
import { LOGGER } from '@legacy-sports/logging';
import { ErrorBoundary } from './ErrorBoundary';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

const ThrowingComponent = ({ error }: { error: Error }): React.ReactElement => {
  throw error;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress React's own console.error output during tests that intentionally throw
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the Error object in a single LOGGER.error call so Rollbar captures the real error', () => {
    const testError = new Error('something went wrong');

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    // Must be called exactly once — a second call with 'Component stack:' as
    // the message would generate a spurious "Error: Component stack:" Rollbar item.
    expect(mockLogger.error.mock.calls).toHaveLength(1);

    const [message, firstArg, secondArg] = mockLogger.error.mock.calls[0] as [
      string,
      Error,
      Record<string, unknown>?,
    ];

    // The first argument must be the real Error so RollbarOutputDestination
    // forwards it (rather than creating new Error(entry.message)).
    expect(message).toBe('Error Boundary caught an error');
    expect(firstArg).toBe(testError);

    // Component stack should be attached as context, not as a separate log call.
    expect(secondArg).toHaveProperty('componentStack');
  });

  it('does not log a separate "Component stack:" message that would pollute Rollbar', () => {
    const testError = new Error('render failure');

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    const messages = (
      mockLogger.error.mock.calls as [string, ...unknown[]][]
    ).map(([msg]) => msg);
    expect(messages).not.toContain('Component stack:');
  });

  it('calls the optional onError callback with error and errorInfo', () => {
    const onError = jest.fn();
    const testError = new Error('callback test');

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      testError,
      expect.objectContaining({
        componentStack: expect.any(String) as unknown,
      }),
    );
  });

  it('includes react-error-boundary context in LOGGER.error call', () => {
    const testError = new Error('context test');

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    const [message, errorArg, contextArg] = mockLogger.error.mock.calls[0] as [
      string,
      Error,
      Record<string, unknown>,
    ];
    expect(message).toBe('Error Boundary caught an error');
    expect(errorArg).toBe(testError);
    expect(contextArg).toHaveProperty('context', 'react-error-boundary');
    expect(contextArg).toHaveProperty('componentStack');
  });

  it('renders the fallback UI when a child throws', () => {
    const { getByText } = render(
      <ErrorBoundary fallback={<>Custom error screen</>}>
        <ThrowingComponent error={new Error('render error')} />
      </ErrorBoundary>,
    );

    expect(getByText('Custom error screen')).toBeTruthy();
  });
});
