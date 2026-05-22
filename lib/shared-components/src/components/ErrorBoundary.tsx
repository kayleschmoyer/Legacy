import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, ScrollView, Text, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { useOptionalAuth } from '../features/auth/hooks/useAuth';

interface BaseProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ClassProps extends BaseProps {
  /**
   * When true, the fallback renders an "Admin debug info" panel containing
   * `error.message` and `componentStack`. Driven by the {@link ErrorBoundary}
   * wrapper which reads it from `useOptionalAuth()`; pass explicitly when
   * using {@link ErrorBoundaryBase} directly (e.g. in tests).
   */
  isAdmin?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Class implementation of the error boundary. Most callers should use the
 * default {@link ErrorBoundary} wrapper which forwards `isAdmin` from the auth
 * context automatically. Use this base class directly when you need to render
 * outside an `AuthProvider` and want to control the admin flag explicitly.
 */
export class ErrorBoundaryBase extends Component<ClassProps, State> {
  constructor(props: ClassProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null });

    // Log the error with component stack as context. RollbarOutputDestination
    // automatically forwards LOGGER.error() calls to Rollbar, so no explicit
    // captureError() call is needed here (avoids double-reporting).
    LOGGER.error('Error Boundary caught an error', error, {
      context: 'react-error-boundary',
      componentStack: errorInfo.componentStack,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, componentStack } = this.state;
      const showAdminPanel = this.props.isAdmin === true;

      return (
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding="$5"
          backgroundColor="$background"
          gap="$4"
        >
          <Text
            fontSize="$8"
            fontWeight="700"
            color="$red10"
            textAlign="center"
          >
            Oops! Something went wrong
          </Text>
          <Text fontSize="$4" textAlign="center" color="$color10">
            We're sorry for the inconvenience. The error has been reported and
            we'll look into it.
          </Text>
          <Button
            onPress={this.handleRetry}
            backgroundColor="$red9"
            borderRadius="$3"
            paddingHorizontal="$5"
            pressStyle={{ backgroundColor: '$red10' }}
          >
            <Text color="$color1" fontWeight="700" fontSize="$4">
              Try Again
            </Text>
          </Button>
          {process.env.NODE_ENV !== 'production' && error && (
            <YStack
              backgroundColor="$background"
              padding="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$red7"
              maxWidth="100%"
            >
              <Text fontFamily="$mono" fontSize="$2" color="$red10">
                {error.toString()}
              </Text>
            </YStack>
          )}
          {showAdminPanel && error && (
            <YStack
              testID="error-boundary-admin-panel"
              backgroundColor="$background"
              padding="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$yellow7"
              gap="$2"
              maxWidth="100%"
              width="100%"
            >
              <Text fontSize="$3" fontWeight="700" color="$yellow11">
                Admin debug info
              </Text>
              <Text
                fontFamily="$mono"
                fontSize="$2"
                color="$color11"
                selectable
              >
                {error.message}
              </Text>
              {componentStack && (
                <ScrollView maxHeight={240} horizontal={false}>
                  <Text
                    fontFamily="$mono"
                    fontSize="$1"
                    color="$color10"
                    selectable
                  >
                    {componentStack.trim()}
                  </Text>
                </ScrollView>
              )}
            </YStack>
          )}
        </YStack>
      );
    }

    return this.props.children;
  }
}

/**
 * Error Boundary component that catches React errors and reports them to Rollbar.
 *
 * When an admin user (via `useOptionalAuth`) is logged in, the fallback also
 * shows an "Admin debug info" panel with `error.message` and the component
 * stack. Non-admin users — and callers rendered outside any `AuthProvider` —
 * see the standard fallback unchanged.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorScreen />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export const ErrorBoundary = (props: BaseProps): React.ReactElement => {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const isAdmin = user?.accessLevel === 'admin' || user?.isAdmin === true;
  return <ErrorBoundaryBase {...props} isAdmin={isAdmin} />;
};
