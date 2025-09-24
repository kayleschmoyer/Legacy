import { useCallback, useEffect, useState } from 'react';
import { AuthService, AuthState, getAuthService } from './AuthService';

export interface UseAuthResult extends AuthState {
  login: (authorizationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
}

/**
 * React hook that provides authentication state and methods
 * Requires AuthService to be initialized via createAuthService()
 */
export function useAuth(): UseAuthResult {
  const authService = getAuthService();

  if (!authService) {
    throw new Error(
      'AuthService not initialized. Call createAuthService() in your app initialization.',
    );
  }

  const [authState, setAuthState] = useState<AuthState>(authService.getState());

  useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState);
    return unsubscribe;
  }, [authService]);

  const login = useCallback(
    async (authorizationCode: string): Promise<void> => {
      return authService.login(authorizationCode);
    },
    [authService],
  );

  const logout = useCallback(async (): Promise<void> => {
    return authService.logout();
  }, [authService]);

  const refreshToken = useCallback(async (): Promise<void> => {
    return authService.refreshToken();
  }, [authService]);

  const checkAuthStatus = useCallback(async (): Promise<boolean> => {
    return authService.checkAuthStatus();
  }, [authService]);

  return {
    ...authState,
    login,
    logout,
    refreshToken,
    checkAuthStatus,
  };
}

/**
 * Higher-order component that provides authentication context
 */
export interface WithAuthProps {
  authService: AuthService;
}

export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P & WithAuthProps> {
  return function WrappedComponent(props: P & WithAuthProps) {
    return <Component {...props} />;
  };
}
