import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage, useAuth } from '@legacy-sports/shared-components';
import type { UseAuthResult } from '@legacy-sports/shared-components';

interface LocationState {
  from?: { pathname: string };
}

export function Login() {
  const { isAuthenticated, isLoading, loginWithOAuth, config }: UseAuthResult =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Debug: Log the OAuth config being used
  console.log('OAuth config:', config);

  // Get the path the user was trying to visit, or default to home
  const from = (location.state as LocationState)?.from?.pathname || '/';

  // Listen for authentication state changes and redirect accordingly
  useEffect(() => {
    console.log('Auth state changed:', { isAuthenticated, isLoading });
    if (isAuthenticated && !isLoading) {
      console.log('Navigating to:', from);
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // If user is already authenticated, redirect to the page they were trying to visit
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  // Don't show login form while checking auth status
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1E1E1E',
          color: '#FFFFFF',
        }}
      >
        <div>Checking authentication...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <LoginPage
        config={config}
        loginWithOAuth={async (oauthResponse) => {
          try {
            console.log(
              'Calling AuthProvider loginWithOAuth with:',
              oauthResponse,
            );
            await loginWithOAuth(oauthResponse);
            console.log('AuthProvider login completed successfully');
            console.log('Auth state after loginWithOAuth:', {
              isAuthenticated,
              isLoading,
            });
          } catch (error) {
            console.error('AuthProvider loginWithOAuth failed:', error);
            throw error;
          }
        }}
        onSuccess={(user) => {
          console.log('Login successful:', user);
          console.log('Current auth state:', { isAuthenticated, isLoading });
          console.log('Forcing navigation to:', from);
          // Navigate immediately since we have a successful login
          // Use setTimeout to ensure any state updates have time to process
          setTimeout(() => {
            console.log('Executing navigation...');
            navigate(from, { replace: true });
          }, 50);
        }}
        onError={(error) => {
          console.error('Login failed:', error);
        }}
        appName="Legacy Sports"
        useWideLayout={true}
        maxWidth={800}
        hideDecorations={false}
      />
    </div>
  );
}

export default Login;
