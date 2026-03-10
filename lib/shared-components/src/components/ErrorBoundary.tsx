import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Optional error reporter function (e.g., Sentry captureError)
   * If provided, will be called with error and context
   */
  reportError?: (error: Error, context: Record<string, unknown>) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches React errors and reports them to Sentry
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
    // Log to console for development
    LOGGER.error('Error Boundary caught an error:', error);
    LOGGER.error('Component stack:', errorInfo.componentStack);

    // Report to error tracking service (e.g., Sentry)
    if (this.props.reportError) {
      this.props.reportError(error, {
        context: 'react-error-boundary',
        componentStack: errorInfo.componentStack ?? 'No component stack',
      });
    }

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
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: '#f8f9fa',
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: 'bold',
              marginBottom: 10,
              color: '#dc3545',
            }}
          >
            Oops! Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 16,
              textAlign: 'center',
              color: '#6c757d',
              marginBottom: 20,
            }}
          >
            We're sorry for the inconvenience. The error has been reported and
            we'll look into it.
          </Text>
          <TouchableOpacity
            onPress={this.handleRetry}
            style={{
              backgroundColor: '#dc3545',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
              Try Again
            </Text>
          </TouchableOpacity>
          {__DEV__ && this.state.error && (
            <View
              style={{
                backgroundColor: '#fff',
                padding: 15,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#dc3545',
                maxWidth: '100%',
              }}
            >
              <Text
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#dc3545',
                }}
              >
                {this.state.error.toString()}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}
