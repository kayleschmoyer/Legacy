import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

// ── Components under test ─────────────────────────────────────────────────────
import { ErrorBoundary } from '@legacy-sports/shared-components';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Replace TouchableOpacity with Pressable to avoid RN animation/renderer
// version-mismatch errors when pressing the ErrorBoundary "Try Again" button.
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return new Proxy(RN, {
    get(target, prop: string) {
      if (prop === 'TouchableOpacity') {
        return ({
          children,
          onPress,
        }: {
          children?: React.ReactNode;
          onPress?: () => void;
        }) => React.createElement(target.Pressable, { onPress }, children);
      }
      return Reflect.get(target, prop) as unknown;
    },
  });
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/shared-components', () => {
  // Load ErrorBoundary from its specific file to avoid the full barrel export,
  // which transitively imports @react-native-google-signin (ESM, not transpiled).
  const { ErrorBoundary: RealErrorBoundary } = jest.requireActual<
    typeof import('../../../../../lib/shared-components/src/components/ErrorBoundary')
  >('../../../../../lib/shared-components/src/components/ErrorBoundary');
  return {
    ErrorBoundary: RealErrorBoundary,
  };
});

// ErrorBoundary's default fallback renders tamagui primitives, which need a
// theme provider. Swap them for plain RN components so the boundary can render
// in isolation without a Tamagui root.
jest.mock('tamagui', () => {
  const {
    View: RNView,
    Text,
    ScrollView,
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
    }) => React.createElement(Text, { testID, onPress }, children),
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
    ScrollView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(ScrollView, { testID }, children),
  };
});

// ── Helper: throw controller (external state so Strict Mode double-invocations
//    both see the same value — not mutated by the throw itself) ─────────────────

const throwCtrl = { active: false };

function ControlledThrowingComponent(): React.JSX.Element {
  if (throwCtrl.active) {
    throw new Error('Simulated render error');
  }
  return React.createElement(View, { testID: 'safe-child' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App resilience tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    throwCtrl.active = false;
    // Suppress React error boundary console noise
    jest.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ErrorBoundary integration', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <View testID="child" />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('child')).toBeTruthy();
    });

    it('shows default error UI when a child component throws', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();
    });

    it('shows a Try Again button in the default error UI', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Try Again')).toBeTruthy();
    });

    it('clears the error and re-renders children when Try Again is pressed', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      // Error UI is showing
      expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();

      // Disable throws so children recover after the boundary resets
      throwCtrl.active = false;
      fireEvent.press(screen.getByText('Try Again'));
      expect(screen.getByTestId('safe-child')).toBeTruthy();
    });

    it('renders a custom fallback instead of the default UI when provided', () => {
      throwCtrl.active = true;
      render(
        <ErrorBoundary fallback={<View testID="custom-fallback" />}>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('custom-fallback')).toBeTruthy();
      expect(screen.queryByText('Oops! Something went wrong')).toBeNull();
    });

    it('calls the onError callback when a child throws', () => {
      const onError = jest.fn();
      throwCtrl.active = true;
      render(
        <ErrorBoundary onError={onError}>
          <ControlledThrowingComponent />
        </ErrorBoundary>,
      );
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String) as unknown,
        }),
      );
    });
  });
});
