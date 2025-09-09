import React, { createContext, useContext, PropsWithChildren } from 'react';
import {
  useCurrentUserInfo,
  LegacySportsJwt,
  AuthHandlers,
  useAuthHandlers,
} from './AuthHooks';

export interface AuthContextValue {
  /**
   * Current user information if authenticated
   */
  user: LegacySportsJwt | null;
  /**
   * Whether authentication is currently being checked
   */
  isLoading: boolean;
  /**
   * Whether user is authenticated
   */
  isAuthenticated: boolean;
  /**
   * Authentication handlers (login, logout)
   */
  authHandlers: AuthHandlers;
  /**
   * Any authentication error
   */
  error: Error | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps extends PropsWithChildren {
  /**
   * Called when authentication state changes
   */
  onAuthStateChange?: (
    isAuthenticated: boolean,
    user: LegacySportsJwt | null
  ) => void;
}

export function AuthProvider({
  children,
  onAuthStateChange,
}: AuthProviderProps): JSX.Element {
  const { data: user, loading: isLoading, error } = useCurrentUserInfo();
  const authHandlers = useAuthHandlers();

  const isAuthenticated = user !== null;

  React.useEffect(() => {
    if (!isLoading && onAuthStateChange) {
      onAuthStateChange(isAuthenticated, user);
    }
  }, [isLoading, isAuthenticated, user, onAuthStateChange]);

  const contextValue: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated,
    authHandlers,
    error,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to get current authenticated user
 * Throws error if user is not authenticated
 */
export function useAuthenticatedUser(): LegacySportsJwt {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    throw new Error('User is not authenticated');
  }

  return user;
}
