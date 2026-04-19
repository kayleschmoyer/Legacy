import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
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
  /**
   * Paths that are accessible without authentication.
   * Matched against window.location.pathname as an exact path or as a prefix when
   * the current pathname continues with a trailing slash.
   * Entries must not include a trailing slash (for example, use '/about', not
   * '/about/'), otherwise prefix matching will not work as expected.
   * Entries must include the router basename/base-path prefix when deployed under
   * a sub-path (for example, '/pr-123/about' in a preview deploy with BASE_URL='/pr-123/').
   * Web-only: ignored in React Native where window is undefined.
   */
  publicPaths?: string[];
  /**
   * Paths that are accessible without authentication using exact matching only —
   * unlike publicPaths, child routes (e.g. /baseball/league/create) are NOT
   * automatically made public when the parent path is listed here.
   * Same basename and no-trailing-slash rules as publicPaths apply.
   * Web-only: ignored in React Native where window is undefined.
   */
  publicExactPaths?: string[];
}

export function EnhancedAuthGuard({
  children,
  loadingComponent,
  loginComponent,
  loginTitle,
  loginSubtitle: _loginSubtitle,
  testMode = false,
  onLoginSuccess,
  onLoginFailure,
  onLogoutSuccess: _onLogoutSuccess,
  publicPaths = [],
  publicExactPaths = [],
}: EnhancedAuthGuardProps) {
  const { isAuthenticated, isLoading, config, loginWithOAuth } = useAuth();

  // In test mode, bypass authentication and show content directly
  if (testMode) {
    return children;
  }

  // Public paths bypass the auth gate entirely (no login wall, no loading spinner).
  // On web, window.location.pathname is already restored by the companion script in
  // index.html before React renders, so this check works for direct-URL navigation.
  // In React Native, window is undefined, so skip the check entirely.
  const currentPath =
    typeof window !== 'undefined' ? window.location.pathname : null;
  const isPublicPath =
    currentPath !== null &&
    (publicPaths.some(
      (p) => currentPath === p || currentPath.startsWith(p + '/'),
    ) ||
      publicExactPaths.some((p) => currentPath === p));
  if (isPublicPath) {
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
          appName={
            loginTitle ? loginTitle.replace('Welcome to ', '') : 'Legacy Sports'
          }
          onSuccess={(_user: { id: number; email: string; name?: string }) => {
            try {
              // The authentication state should already be updated by loginWithOAuth
              // Call the optional callback if provided
              onLoginSuccess?.();
            } catch (error) {
              LOGGER.error('Authentication callback failed:', String(error));
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Authentication failed';
              onLoginFailure?.(errorMessage);
            }
          }}
          onError={(error: Error) => {
            // Login failures (wrong credentials, unauthorized account) are expected
            // user-facing conditions, not bugs — use warn to avoid Rollbar noise.
            LOGGER.warn('Authentication Error:', error);
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
