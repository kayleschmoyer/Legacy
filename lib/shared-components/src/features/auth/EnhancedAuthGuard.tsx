import React, { useEffect } from 'react';
import { Spinner, Text, YStack } from 'tamagui';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './LoginPage';

export interface EnhancedAuthGuardProps {
  /**
   * Content to render when user is authenticated
   */
  children: React.ReactNode;
  /**
   * Custom loading component
   */
  loadingComponent?: React.ReactNode;
  /**
   * Custom login component
   */
  loginComponent?: React.ReactNode;
  /**
   * Title for the login screen
   */
  loginTitle?: string;
  /**
   * Subtitle for the login screen
   */
  loginSubtitle?: string;
  /**
   * Test mode - enables mock login
   */
  testMode?: boolean;
  /**
   * Called when login is successful
   */
  onLoginSuccess?: () => void;
  /**
   * Called when login fails
   */
  onLoginFailure?: (error: string) => void;
  /**
   * Called when logout is successful
   */
  onLogoutSuccess?: () => void;
}

export function EnhancedAuthGuard({
  children,
  loadingComponent,
  loginComponent,
  loginTitle,
  loginSubtitle,
  testMode = false,
  onLoginSuccess,
  onLoginFailure,
  onLogoutSuccess,
}: EnhancedAuthGuardProps) {
  const { isAuthenticated, isLoading, config, loginWithOAuth, user } =
    useAuth();

  // Debug logging
  console.log('EnhancedAuthGuard render:', {
    isAuthenticated,
    isLoading,
    hasUser: !!user,
    userId: user?.id,
    testMode,
  });

  // Track authentication state changes
  useEffect(() => {
    console.log('EnhancedAuthGuard - Auth state changed:', {
      isAuthenticated,
      isLoading,
      hasUser: !!user,
      testMode,
    });
  }, [isAuthenticated, isLoading, user, testMode]);

  // In test mode, bypass authentication and show content directly
  if (testMode) {
    console.log(
      'EnhancedAuthGuard - Test mode enabled, showing authenticated content',
    );
    return children;
  }

  // Show loading state
  if (isLoading) {
    return (
      loadingComponent || (
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          backgroundColor="$background"
          space="$3"
        >
          <Spinner size="large" color="$blue10" />
          <Text color="$color11">Loading...</Text>
        </YStack>
      )
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      loginComponent || (
        <LoginPage
          config={config}
          loginWithOAuth={loginWithOAuth}
          appName={loginTitle ? loginTitle.replace('Welcome to ', '') : 'Legacy Sports'}
          onSuccess={(user: { id: number; email: string; name?: string }) => {
            try {
              console.log('EnhancedAuthGuard - Login successful, user:', user);
              // The authentication state should already be updated by loginWithOAuth
              // Call the optional callback if provided
              onLoginSuccess?.();
            } catch (error) {
              console.error('Authentication callback failed:', error);
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Authentication failed';
              onLoginFailure?.(errorMessage);
            }
          }}
          onError={(error: Error) => {
            console.error('Authentication Error:', error);
            const errorMessage =
              error instanceof Error ? error.message : 'Authentication failed';
            onLoginFailure?.(errorMessage);
          }}
        />
      )
    );
  }

  // Show authenticated content
  return children;
}

/**
 * Simple authentication wrapper that only shows children when authenticated
 */
export interface RequireAuthProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAuth({ children, fallback }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      fallback || (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner size="large" />
        </YStack>
      )
    );
  }

  if (!isAuthenticated) {
    return (
      fallback || (
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          padding="$4"
        >
          <Text color="$color11">Please log in to continue</Text>
        </YStack>
      )
    );
  }

  return children;
}
