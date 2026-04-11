import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches React errors and reports them to Rollbar
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
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error with component stack as context. RollbarOutputDestination
    // automatically forwards LOGGER.error() calls to Rollbar, so no explicit
    // captureError() call is needed here (avoids double-reporting).
    LOGGER.error('Error Boundary caught an error', error, {
      context: 'react-error-boundary',
      componentStack: errorInfo.componentStack,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Return custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
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
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <YStack
              backgroundColor="$background"
              padding="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$red7"
              maxWidth="100%"
            >
              <Text fontFamily="$mono" fontSize="$2" color="$red10">
                {this.state.error.toString()}
              </Text>
            </YStack>
          )}
        </YStack>
      );
    }

    return this.props.children;
  }
}
