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

interface User {
  id: number;
  email: string;
  username: string;
  picture?: string;
  accessLevel: 'none' | 'user' | 'admin';
  // Legacy compatibility
  isAdmin?: boolean;
}

interface JwtPayload {
  id?: number;
  email?: string;
  username?: string;
  name?: string;
  picture?: string;
  accessLevel?: 'none' | 'user' | 'admin';
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

  console.log('useAuth - Returning context with loading:', context.isLoading);
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
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean };

const initialAuthState: AuthState = {
  user: null,
  isLoading: true,
  error: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  console.log(
    'AuthProvider reducer - Action:',
    action.type,
    'Loading:',
    state.isLoading,
    '→',
    action.type === 'SET_LOADING' ? action.payload : state.isLoading,
  );

  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS': {
      // DEBUG: Log the user payload and picture field
      console.log(
        '[authReducer] AUTH_SUCCESS - Payload received:',
        action.payload,
      );
      console.log(
        '[authReducer] AUTH_SUCCESS - Picture in payload:',
        action.payload.picture,
      );

      const newState = {
        ...state,
        isLoading: false,
        user: action.payload,
        error: null,
      };

      console.log(
        '[authReducer] AUTH_SUCCESS - New state user:',
        newState.user,
      );
      console.log(
        '[authReducer] AUTH_SUCCESS - Picture in new state:',
        newState.user?.picture,
      );

      return newState;
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
      };

    case 'CLEAR_ERROR':
      console.log('🔄 authReducer - CLEAR_ERROR case');
      return {
        ...state,
        error: null,
      };

    case 'SET_LOADING': {
      console.log(
        '🔄 authReducer - SET_LOADING case - Changing isLoading from',
        state.isLoading,
        'to',
        action.payload,
      );
      const newState = {
        ...state,
        isLoading: action.payload,
      };
      console.log('🔄 authReducer - SET_LOADING case - New state:', {
        isLoading: newState.isLoading,
      });
      return newState;
    }

    default:
      console.warn('authReducer - Unknown action type:', action);
      return state;
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config,
}) => {
  // Define reducer inline to avoid scoping issues
  const inlineAuthReducer = (
    state: AuthState,
    action: AuthAction,
  ): AuthState => {
    console.log('Inline reducer called (unused) - Action:', action.type);

    switch (action.type) {
      case 'SET_LOADING':
        console.log(
          '� Inline reducer - SET_LOADING case - Changing isLoading from',
          state.isLoading,
          'to',
          action.payload,
        );
        return { ...state, isLoading: action.payload };
      case 'CLEAR_ERROR':
        return { ...state, error: null };
      default:
        return state;
    }
  };

  console.log(
    '�🚀 AuthProvider - Initializing useReducer with INLINE reducer:',
    typeof inlineAuthReducer,
  );
  const [authState, dispatchAuth] = useReducer(authReducer, initialAuthState);
  console.log(
    '🚀 AuthProvider - useReducer initialized, authState:',
    authState,
    'dispatch:',
    typeof dispatchAuth,
  );
  const { user, isLoading, error } = authState;

  const authService = useMemo(() => new AuthService(config), [config]);

  // Track isLoading state changes
  useEffect(() => {
    console.log('AuthProvider - isLoading state changed to:', isLoading);
  }, [isLoading]);

  // Initialize auth state on mount
  useEffect(() => {
    console.log('AuthProvider - useEffect triggered');
    let isMounted = true;

    const initializeAuth = () => {
      console.log('AuthProvider - Starting initialization...');
      try {
        console.log('AuthProvider - Checking for stored token...');
        const token = authService.getStoredToken();
        console.log('AuthProvider - Stored token:', token ? 'Found' : 'None');

        if (token) {
          console.log('AuthProvider - Verifying token...');
          const isValid = authService.verifyToken(token);
          console.log('AuthProvider - Token valid:', isValid);

          if (isValid) {
            // Token is valid, extract user info from JWT payload
            try {
              console.log('AuthProvider - Decoding token payload...');
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(
                  atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
                ) as JwtPayload;
                // DEBUG: Log payload and picture extraction
                console.log('[useAuth] JWT Payload:', payload);
                console.log('[useAuth] Picture from payload:', payload.picture);

                const userInfo = {
                  id: payload.id || 0,
                  email: payload.email || '',
                  username: payload.username || payload.name || 'Unknown',
                  picture: payload.picture,
                  accessLevel: payload.accessLevel || ('user' as const),
                };

                // DEBUG: Log final user info and picture
                console.log('[useAuth] Final userInfo object:', userInfo);
                console.log('[useAuth] Picture in userInfo:', userInfo.picture);
                console.log('AuthProvider - Setting user:', userInfo);

                if (isMounted) {
                  console.log(
                    '[useAuth] About to dispatch AUTH_SUCCESS with user:',
                    userInfo,
                  );
                  dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
                }
              }
            } catch (decodeError) {
              console.error('Failed to decode stored token:', decodeError);
              authService.clearTokens();
            }
          } else {
            // Token is invalid, clear it
            console.log('AuthProvider - Token invalid, clearing...');
            authService.clearTokens();
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        authService.clearTokens();
      } finally {
        console.log(
          'AuthProvider - Initialization complete, setting loading to false',
        );
        console.log('AuthProvider - isMounted check:', isMounted);
        if (isMounted) {
          console.log('AuthProvider - About to dispatch SET_LOADING false');
          console.log(
            'AuthProvider - dispatchAuth function:',
            typeof dispatchAuth,
          );
          const action = { type: 'SET_LOADING' as const, payload: false };
          console.log('AuthProvider - Action object:', action);
          dispatchAuth(action);
          console.log('AuthProvider - dispatchAuth SET_LOADING false called');
        } else {
          console.log(
            'AuthProvider - Component unmounted, skipping state update',
          );
        }
      }
    };

    void initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [authService]);

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
        console.log(
          'AuthProvider: Calling authService.authenticateWithOAuth...',
        );
        const userInfo = await authService.authenticateWithOAuth(oauthResponse);
        console.log('AuthProvider: Setting user to:', userInfo);
        dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
        console.log('AuthProvider: User state updated');
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
      dispatchAuth({ type: 'AUTH_LOGOUT' });
      await Promise.resolve(); // Ensure async behavior to match interface
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [authService]);

  const clearError = useCallback(() => {
    dispatchAuth({ type: 'CLEAR_ERROR' });
  }, []);

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

  const contextValue: AuthContextType = useMemo(() => {
    const value = {
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
    };

    console.log(
      'AuthProvider - Creating context value with loading:',
      isLoading,
    );
    return value;
  }, [
    user,
    isLoading,
    error,
    config,
    login,
    loginWithOAuth,
    loginWithProvider,
    logout,
    clearError,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export default useAuth;
