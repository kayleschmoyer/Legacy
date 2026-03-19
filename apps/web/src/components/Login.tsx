import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LoginPage,
  Paragraph,
  useAuth,
  YStack,
} from '@legacy-sports/shared-components';
import type { UseAuthResult } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';

interface LocationState {
  from?: { pathname: string };
}

export function Login() {
  LOGGER.info('Login component - Starting to render');

  const { isAuthenticated, isLoading, loginWithOAuth, config }: UseAuthResult =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Track whether we've shown the login form at least once, so we don't
  // unmount LoginPage (and lose its error state) during OAuth authentication.
  const hasShownLoginRef = useRef(false);

  LOGGER.info('Login component - Auth state:', { isAuthenticated, isLoading });
  LOGGER.info('Login component - Location:', location.pathname);
  LOGGER.info('Login component - OAuth config:', config);

  // Get the path the user was trying to visit, or default to home
  const from = (location.state as LocationState)?.from?.pathname || '/';

  // Listen for authentication state changes and redirect accordingly
  useEffect(() => {
    LOGGER.info('Auth state changed:', { isAuthenticated, isLoading });
    if (isAuthenticated && !isLoading) {
      LOGGER.info('Navigating to:', from);
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // If user is already authenticated, redirect to the page they were trying to visit
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  // Show loading spinner only for the initial auth check, not during
  // OAuth authentication (which would unmount LoginPage and lose error state).
  if (isLoading && !hasShownLoginRef.current) {
    return (
      <YStack
        minHeight="100vh"
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
        color="$color"
      >
        <Paragraph>Checking authentication...</Paragraph>
      </YStack>
    );
  }

  // Once we render LoginPage, remember it so we don't unmount it mid-auth
  hasShownLoginRef.current = true;

  return (
    <YStack
      minHeight="100vh"
      backgroundColor="$background"
      overflow="hidden"
      maxWidth="100vw"
    >
      <LoginPage
        config={config}
        loginWithOAuth={async (oauthResponse) => {
          try {
            LOGGER.info(
              'Calling AuthProvider loginWithOAuth with:',
              oauthResponse,
            );
            await loginWithOAuth(oauthResponse);
            LOGGER.info('AuthProvider login completed successfully');
            LOGGER.info('Auth state after loginWithOAuth:', {
              isAuthenticated,
              isLoading,
            });
          } catch (error) {
            LOGGER.error('AuthProvider loginWithOAuth failed:', String(error));
            throw error;
          }
        }}
        onSuccess={(user) => {
          LOGGER.info('Login successful:', user);
          LOGGER.info('Current auth state:', { isAuthenticated, isLoading });
          LOGGER.info('Forcing navigation to:', from);
          // Navigate immediately since we have a successful login
          // Use setTimeout to ensure any state updates have time to process
          setTimeout(() => {
            LOGGER.info('Executing navigation...');
            navigate(from, { replace: true });
          }, 50);
        }}
        onError={(error) => {
          LOGGER.error('Login failed:', error);
        }}
        appName="Legacy Sports"
        useWideLayout={true}
        maxWidth={800}
        hideDecorations={false}
      />
    </YStack>
  );
}

export default Login;
