import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Paragraph, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import type { UseAuthResult } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Protected Route component that redirects to login if user is not authenticated
 * Preserves the current location to redirect back after login
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading }: UseAuthResult = useAuth();
  const location = useLocation();

  LOGGER.info('ProtectedRoute - Auth state:', {
    isAuthenticated,
    isLoading,
    currentPath: location.pathname,
  });

  // Show loading state while checking authentication
  if (isLoading) {
    LOGGER.info('ProtectedRoute - Showing loading state');
    return (
      <YStack
        minHeight="100vh"
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
        color="$color"
      >
        <Paragraph>Loading...</Paragraph>
      </YStack>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    LOGGER.info(
      'ProtectedRoute - User not authenticated, redirecting to login',
    );
    LOGGER.info(
      'ProtectedRoute - Navigate component should redirect to /login',
    );
    // Save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  LOGGER.info(
    'ProtectedRoute - User authenticated, rendering protected content',
  );
  // User is authenticated, render the protected content
  return children as React.ReactElement;
}

export default ProtectedRoute;
