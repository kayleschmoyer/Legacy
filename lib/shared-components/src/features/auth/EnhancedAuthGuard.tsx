import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Spinner, Text, YStack } from 'tamagui';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './LoginPage';
import { OAuthProvider } from '../../platform-components';
import { OAuthErrorCode } from '../../platform-components/types';
import type {
  OAuthConfig,
  OAuthResponse,
} from '../../platform-components/types';

interface EmbeddedLoginCardProps {
  config: OAuthConfig;
  loginWithOAuth: (response: OAuthResponse) => Promise<void>;
  onLoginSuccess?: () => void;
  onLoginFailure?: (error: string) => void;
}

function EmbeddedLoginCard({
  config,
  loginWithOAuth,
  onLoginSuccess,
  onLoginFailure,
}: EmbeddedLoginCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const configure = async () => {
      try {
        await OAuthProvider.configure({
          ...config,
          gsi: { ...(config.gsi ?? {}), oneTap: false },
        });
        setIsConfigured(true);
      } catch (error) {
        LOGGER.warn(
          'Failed to configure OAuth in EnhancedAuthGuard:',
          error instanceof Error ? error : String(error),
        );
      } finally {
        setIsConfiguring(false);
      }
    };
    void configure();
  }, [config]);

  const handleSignIn = useCallback(async () => {
    if (!isConfigured || isLoading || isConfiguring) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const oauthResponse = await OAuthProvider.signIn();
      await loginWithOAuth(oauthResponse);
      onLoginSuccess?.();
    } catch (error) {
      const isCancelled =
        error instanceof Error &&
        'code' in error &&
        (error as { code: OAuthErrorCode }).code ===
          OAuthErrorCode.SIGN_IN_CANCELLED;
      if (isCancelled) {
        LOGGER.debug('Google sign-in popup closed by user');
      } else {
        LOGGER.warn(
          'Authentication error in EnhancedAuthGuard:',
          error instanceof Error ? error : String(error),
        );
        const msg =
          error instanceof Error ? error.message : 'Authentication failed';
        setErrorMessage(msg);
        onLoginFailure?.(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isConfigured,
    isConfiguring,
    isLoading,
    loginWithOAuth,
    onLoginSuccess,
    onLoginFailure,
  ]);

  return (
    <LoginPage
      onGoogleSignIn={() => {
        void handleSignIn();
      }}
      isGoogleLoading={isLoading}
      isConfiguring={isConfiguring}
      errorMessage={errorMessage || undefined}
    />
  );
}

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
   * Current router pathname, supplied by native/router integrations that do not
   * expose window.location.
   */
  currentPath?: string | null;
  /**
   * Paths that are accessible without authentication.
   * Matched against the current pathname as an exact path or as a prefix when
   * the current pathname continues with a trailing slash.
   * Entries must not include a trailing slash (for example, use '/about', not
   * '/about/'), otherwise prefix matching will not work as expected.
   * Entries must include the router basename/base-path prefix when deployed under
   * a sub-path (for example, '/pr-123/about' in a preview deploy with BASE_URL='/pr-123/').
   * Native callers should pass currentPath from their router.
   */
  publicPaths?: string[];
  /**
   * Paths that are accessible without authentication using exact matching only —
   * unlike publicPaths, child routes (e.g. /baseball/league/create) are NOT
   * automatically made public when the parent path is listed here.
   * Same basename and no-trailing-slash rules as publicPaths apply.
   * Native callers should pass currentPath from their router.
   */
  publicExactPaths?: string[];
}

export function EnhancedAuthGuard({
  children,
  loadingComponent,
  loginComponent,
  loginTitle: _loginTitle,
  loginSubtitle: _loginSubtitle,
  testMode = false,
  onLoginSuccess,
  onLoginFailure,
  onLogoutSuccess: _onLogoutSuccess,
  currentPath: currentPathOverride,
  publicPaths = [],
  publicExactPaths = [],
}: EnhancedAuthGuardProps) {
  const { isAuthenticated, isLoading, loginWithOAuth, config } = useAuth();

  // Track whether the user has been authenticated at any point this session.
  // Once true, a subsequent unauthenticated state means they were just logged
  // out (manual sign-out or session expiry) — in that case we always show the
  // LoginPage so there is a clear way to sign back in, even on public paths.
  // Without this, a passive logout while viewing a public path (e.g. /baseball,
  // /about) would leave the user on a page with no nav bar (Navigation hides
  // when !isAuthenticated) and no login UI (publicPath bypass returns App).
  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
    }
  }, [isAuthenticated]);

  // In test mode, bypass authentication and show content directly
  if (testMode) {
    return children;
  }

  // Public paths bypass the auth gate entirely (no login wall, no loading spinner).
  // On web, window.location.pathname is already restored by the companion script in
  // index.html before React renders, so this check works for direct-URL navigation.
  // In React Native, window can exist without location, so native callers should
  // provide the router pathname and the fallback must remain safe during startup.
  const currentPath =
    currentPathOverride ??
    (typeof window !== 'undefined' ? (window.location?.pathname ?? '') : '');
  const isPublicPath =
    currentPath.length > 0 &&
    (publicPaths.some(
      (p) => currentPath === p || currentPath.startsWith(p + '/'),
    ) ||
      publicExactPaths.some((p) => currentPath === p));
  // Skip the public-path bypass when the user was just logged out so the
  // LoginPage renders instead of leaving them stranded with no nav bar and
  // no sign-in affordance.
  const justLoggedOut =
    wasAuthenticatedRef.current && !isAuthenticated && !isLoading;
  if (isPublicPath && !justLoggedOut) {
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
        <EmbeddedLoginCard
          config={config}
          loginWithOAuth={loginWithOAuth}
          onLoginSuccess={onLoginSuccess}
          onLoginFailure={onLoginFailure}
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
