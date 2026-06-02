import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScreenErrorBoundary } from './_screenErrorBoundary';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('tamagui', () => {
  const {
    View: RNView,
    Text,
    Pressable,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Pressable, { testID, onPress }, children),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID }, children),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(RNView, { testID }, children),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ScreenErrorBoundary', () => {
  const error = new Error('Test screen error');
  const retry = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the error heading', () => {
    render(<ScreenErrorBoundary error={error} retry={retry} />);
    expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();
  });

  it('renders a Try Again button', () => {
    render(<ScreenErrorBoundary error={error} retry={retry} />);
    expect(screen.getByTestId('screen-error-retry')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('calls retry when Try Again is pressed', () => {
    render(<ScreenErrorBoundary error={error} retry={retry} />);
    fireEvent.press(screen.getByTestId('screen-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows error details in non-production environments', () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      writable: true,
    });
    render(<ScreenErrorBoundary error={error} retry={retry} />);
    expect(screen.getByText(error.toString())).toBeTruthy();
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      writable: true,
    });
  });

  it('logs the error via LOGGER on mount', async () => {
    const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
      '@legacy-sports/logging',
    );
    render(<ScreenErrorBoundary error={error} retry={retry} />);
    // useEffect fires after render
    await Promise.resolve();
    expect(LOGGER.error).toHaveBeenCalledWith(
      'Screen error boundary caught an error',
      error,
      expect.objectContaining({ context: 'screen-error-boundary' }),
    );
  });
});
