import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { AuthService } from '../services/AuthService';
import type {
  OAuthConfig,
  OAuthResponse,
} from '../../../platform-components/types';

interface ImpersonatedBy {
  id: number;
  email?: string;
  username: string;
}

interface User {
  id: number;
  email: string;
  username: string;
  picture?: string;
  accessLevel: 'none' | 'user' | 'admin';
  // Legacy compatibility
  isAdmin?: boolean;
  /** Set when this session was started via admin impersonation. */
  impersonatedBy?: ImpersonatedBy;
}

interface JwtPayload {
  id?: number;
  email?: string;
  username?: string;
  name?: string;
  picture?: string;
  accessLevel?: 'none' | 'user' | 'admin';
  impersonatedBy?: ImpersonatedBy;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  config: OAuthConfig;
  login: (email: string, password: string) => Promise<void>;
  loginWithOAuth: (oauthResponse: OAuthResponse) => Promise<void>;
  loginWithProvider: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** True when an admin is currently acting as another user. */
  isImpersonating: boolean;
  /** The original admin user who initiated impersonation. */
  adminUser: User | null;
  /** Begin impersonating another user using the given JWT. */
  impersonateUser: (impersonationToken: string) => void;
  /** Restore the original admin session. */
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Export the type for external use
export type UseAuthResult = AuthContextType;

/**
 * Modern authentication hook with two-lambda integration
 *
 * Features:
 * - OAuth and email/password authentication
 * - Automatic token validation and refresh
 * - Secure token storage
 * - Type-safe user management
 * - Cross-platform compatibility
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
  config: OAuthConfig;
}

// Modern authentication state management with useReducer
interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isImpersonating: boolean;
  adminUser: User | null;
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean }
  | {
      type: 'IMPERSONATE_START';
      payload: { adminUser: User; targetUser: User };
    }
  | { type: 'IMPERSONATE_STOP'; payload: User };

const initialAuthState: AuthState = {
  user: null,
  isLoading: true,
  error: null,
  isImpersonating: false,
  adminUser: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS': {
      return {
        ...state,
        isLoading: false,
        user: action.payload,
        error: null,
      };
    }

    case 'AUTH_FAILURE':
      return {
        ...state,
        isLoading: false,
        user: null,
        error: action.payload,
      };

    case 'AUTH_LOGOUT':
      return {
        ...state,
        isLoading: false,
        user: null,
        error: null,
        isImpersonating: false,
        adminUser: null,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'SET_LOADING': {
      return {
        ...state,
        isLoading: action.payload,
      };
    }

    case 'IMPERSONATE_START':
      return {
        ...state,
        isImpersonating: true,
        adminUser: action.payload.adminUser,
        user: action.payload.targetUser,
      };

    case 'IMPERSONATE_STOP':
      return {
        ...state,
        isImpersonating: false,
        adminUser: null,
        user: action.payload,
      };

    default:
      console.warn('authReducer - Unknown action type:', action);
      return state;
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config,
}) => {
  const [authState, dispatchAuth] = useReducer(authReducer, initialAuthState);
  const { user, isLoading, error, isImpersonating, adminUser } = authState;

  const authService = useMemo(() => new AuthService(config), [config]);

  /** Decode a JWT string into a User object (no signature verification). */
  const decodeUserFromToken = useCallback((token: string): User | null => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as JwtPayload;
      return {
        id: payload.id || 0,
        email: payload.email || '',
        username: payload.username || payload.name || 'Unknown',
        picture: payload.picture,
        accessLevel: payload.accessLevel || ('user' as const),
        impersonatedBy: payload.impersonatedBy,
      };
    } catch {
      return null;
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = () => {
      try {
        const token = authService.getStoredToken();

        if (token) {
          const isValid = authService.verifyToken(token);

          if (isValid) {
            // Token is valid, extract user info from JWT payload
            const userInfo = decodeUserFromToken(token);

            if (userInfo && isMounted) {
              // Check if we are currently impersonating
              const adminToken =
                typeof localStorage !== 'undefined'
                  ? localStorage.getItem('admin_original_jwt')
                  : null;

              if (adminToken) {
                const adminUserInfo = decodeUserFromToken(adminToken);
                if (adminUserInfo) {
                  dispatchAuth({
                    type: 'IMPERSONATE_START',
                    payload: { adminUser: adminUserInfo, targetUser: userInfo },
                  });
                  return;
                }
              }

              dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
            }
          } else {
            // Token is invalid, clear it
            authService.clearTokens();
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        authService.clearTokens();
      } finally {
        if (isMounted) {
          dispatchAuth({ type: 'SET_LOADING', payload: false });
        }
      }
    };

    void initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [authService, decodeUserFromToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      dispatchAuth({ type: 'AUTH_START' });

      try {
        const userInfo = await authService.authenticateWithEmail(
          email,
          password,
        );
        dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Login failed';
        dispatchAuth({ type: 'AUTH_FAILURE', payload: errorMessage });
        throw error;
      }
    },
    [authService],
  );

  const loginWithOAuth = useCallback(
    async (oauthResponse: OAuthResponse) => {
      dispatchAuth({ type: 'AUTH_START' });

      try {
        const userInfo = await authService.authenticateWithOAuth(oauthResponse);
        dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
      } catch (error) {
        console.error('AuthProvider: loginWithOAuth error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'OAuth login failed';
        dispatchAuth({ type: 'AUTH_FAILURE', payload: errorMessage });
        throw error;
      }
    },
    [authService],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      authService.clearTokens();
      // Also clear any impersonation state
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('admin_original_jwt');
      }
      dispatchAuth({ type: 'AUTH_LOGOUT' });
      await Promise.resolve(); // Ensure async behavior to match interface
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [authService]);

  const clearError = useCallback(() => {
    dispatchAuth({ type: 'CLEAR_ERROR' });
  }, []);

  /**
   * Begin impersonating another user.  The calling user must be an admin.
   * Stores the current admin token so impersonation can be reverted.
   *
   * @param impersonationToken - A signed JWT returned by the `impersonateUser` GraphQL mutation.
   */
  const impersonateUser = useCallback(
    (impersonationToken: string) => {
      const currentToken = authService.getStoredToken();
      if (!currentToken) {
        console.error('impersonateUser: no current token to save');
        return;
      }

      const currentAdminUser = decodeUserFromToken(currentToken);
      if (!currentAdminUser) {
        console.error('impersonateUser: could not decode current user');
        return;
      }

      const targetUser = decodeUserFromToken(impersonationToken);
      if (!targetUser) {
        console.error('impersonateUser: could not decode impersonation token');
        return;
      }

      // Persist admin token so we can restore after impersonation
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('admin_original_jwt', currentToken);
        localStorage.setItem('auth_jwt', impersonationToken);
      }

      dispatchAuth({
        type: 'IMPERSONATE_START',
        payload: { adminUser: currentAdminUser, targetUser },
      });
    },
    [authService, decodeUserFromToken],
  );

  /** Restore the original admin session, ending impersonation. */
  const stopImpersonating = useCallback(() => {
    const adminToken =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('admin_original_jwt')
        : null;

    if (!adminToken) {
      console.error('stopImpersonating: no admin token stored');
      return;
    }

    const adminUserInfo = decodeUserFromToken(adminToken);
    if (!adminUserInfo) {
      console.error('stopImpersonating: could not decode admin token');
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_jwt', adminToken);
      localStorage.removeItem('admin_original_jwt');
    }

    dispatchAuth({ type: 'IMPERSONATE_STOP', payload: adminUserInfo });
  }, [decodeUserFromToken]);

  const loginWithProvider = useCallback(async (): Promise<void> => {
    dispatchAuth({ type: 'AUTH_START' });

    try {
      // This should be called from OAuthProvider directly
      await Promise.reject(
        new Error(
          'loginWithProvider should be used with OAuthProvider component, not directly',
        ),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'OAuth provider login failed';
      dispatchAuth({ type: 'AUTH_FAILURE', payload: errorMessage });
      throw error;
    }
  }, []);

  const contextValue: AuthContextType = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      error,
      config,
      login,
      loginWithOAuth,
      loginWithProvider,
      logout,
      clearError,
      isImpersonating,
      adminUser,
      impersonateUser,
      stopImpersonating,
    }),
    [
      user,
      isLoading,
      error,
      config,
      login,
      loginWithOAuth,
      loginWithProvider,
      logout,
      clearError,
      isImpersonating,
      adminUser,
      impersonateUser,
      stopImpersonating,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export default useAuth;
