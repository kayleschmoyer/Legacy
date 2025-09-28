import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  accessLevel: 'none' | 'user' | 'admin';
  // Legacy compatibility
  isAdmin?: boolean;
}

interface JwtPayload {
  id?: number;
  email?: string;
  username?: string;
  name?: string;
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
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
  config: OAuthConfig;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authService = useMemo(() => new AuthService(config), [config]);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = authService.getStoredToken();
        if (token) {
          const isValid = await authService.verifyToken(token);
          if (isValid) {
            // Token is valid, extract user info from JWT payload
            try {
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(
                  atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
                ) as JwtPayload;
                const userInfo = {
                  id: payload.id || 0,
                  email: payload.email || '',
                  username: payload.username || payload.name || 'Unknown',
                  accessLevel: payload.accessLevel || ('user' as const),
                };
                setUser(userInfo);
              }
            } catch (decodeError) {
              console.error('Failed to decode stored token:', decodeError);
              authService.clearTokens();
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
        setIsLoading(false);
      }
    };

    void initializeAuth();
  }, [authService]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const userInfo = await authService.authenticateWithEmail(
          email,
          password,
        );
        setUser(userInfo);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Login failed';
        setError(errorMessage);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [authService],
  );

  const loginWithOAuth = useCallback(
    async (oauthResponse: OAuthResponse) => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(
          'AuthProvider: Calling authService.authenticateWithOAuth...',
        );
        const userInfo = await authService.authenticateWithOAuth(oauthResponse);
        console.log('AuthProvider: Setting user to:', userInfo);
        setUser(userInfo);
        console.log('AuthProvider: User state updated');
      } catch (error) {
        console.error('AuthProvider: loginWithOAuth error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'OAuth login failed';
        setError(errorMessage);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [authService],
  );

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      authService.clearTokens();
      setUser(null);
      await Promise.resolve(); // Ensure async behavior to match interface
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loginWithProvider = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

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
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const contextValue: AuthContextType = {
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

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export default useAuth;
