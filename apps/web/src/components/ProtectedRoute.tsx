import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components';
import type { UseAuthResult } from '@legacy-sports/shared-components';

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

  // Show loading state while checking authentication
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
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated, render the protected content
  return children as React.ReactElement;
}

export default ProtectedRoute;
