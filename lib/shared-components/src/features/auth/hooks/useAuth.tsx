import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
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
  /**
   * Called after every impersonation start/stop so callers can flush any
   * user-scoped caches (e.g. Apollo InMemoryCache) before the new identity
   * makes its first request.
   */
  onUserSwitch?: () => Promise<void>;
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
      LOGGER.warn('authReducer - Unknown action type:', action);
      return state;
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config,
  onUserSwitch,
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

  // ─── Proactive token refresh ───────────────────────────────────────────────

  /** Holds the ID of the pending refresh timeout so we can cancel it. */
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Stable ref to `scheduleProactiveRefresh` so its setTimeout callback can
   * always call the *latest* version and avoid stale-closure issues.
   */
  const scheduleProactiveRefreshRef = useRef<((token: string) => void) | null>(
    null,
  );

  /** Cancel any pending proactive refresh timer. */
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /**
   * Schedule a background JWT refresh to fire 5 minutes before the token
   * expires. When the timer fires it silently obtains a fresh token, updates
   * auth state, and reschedules for the new expiry — keeping the session alive
   * indefinitely while the browser tab stays open.
   *
   * Accepts either a JWT string (to decode expiry) or a numeric expiry
   * (seconds since epoch) when the JWT isn't available in JS (HttpOnly cookie).
   */
  const scheduleProactiveRefresh = useCallback(
    (tokenOrExpiry: string | number) => {
      clearRefreshTimer();

      let expSeconds: number | undefined;

      if (typeof tokenOrExpiry === 'number') {
        expSeconds = tokenOrExpiry;
      } else {
        // Decode expiry from JWT string
        try {
          const parts = tokenOrExpiry.split('.');
          if (parts.length === 3) {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
            const payload = JSON.parse(atob(padded)) as {
              exp?: number;
            };
            expSeconds = payload.exp;
          }
        } catch {
          // Can't decode — skip scheduling
        }
      }

      if (!expSeconds) return;

      // Fire 5 minutes before expiry; clamp to at least 0 ms
      const FIVE_MIN_MS = 5 * 60 * 1000;
      const msUntilRefresh = Math.max(
        0,
        expSeconds * 1000 - Date.now() - FIVE_MIN_MS,
      );

      refreshTimerRef.current = setTimeout(() => {
        authService
          .refreshJwt()
          .then((newToken) => {
            if (!newToken) return; // Silently skip; error link handles hard failures
            const userInfo = decodeUserFromToken(newToken);
            if (userInfo) {
              dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
              authService.storeUserProfile(userInfo);
            }
            // Reschedule using the ref so we always call the latest version
            scheduleProactiveRefreshRef.current?.(newToken);
          })
          .catch(() => {
            // Silently ignore — the error link is the safety net
          });
      }, msUntilRefresh);
    },
    [authService, clearRefreshTimer, decodeUserFromToken],
  );

  // Keep the ref pointing at the latest function on every render
  scheduleProactiveRefreshRef.current = scheduleProactiveRefresh;

  // ─── Listen for token-refreshed events from Apollo error link ───────────
  // The Apollo client's silentlyRefreshJwt() runs outside React context.
  // When it successfully refreshes a JWT, it dispatches an
  // `auth:token-refreshed` window event with the decoded user profile so
  // the auth state reflects claim changes (e.g. accessLevel promotion)
  // without requiring a full page reload.
  useEffect(() => {
    const handleTokenRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ user: User; exp?: number }>)
        .detail;
      if (!detail?.user) return;

      // Ignore token-refreshed events during admin impersonation — the
      // refreshed JWT belongs to the real admin, not the impersonated user.
      const hasImpersonationToken =
        typeof localStorage !== 'undefined' &&
        !!localStorage.getItem('auth_jwt');
      if (hasImpersonationToken) return;

      dispatchAuth({ type: 'AUTH_SUCCESS', payload: detail.user });
      authService.storeUserProfile(detail.user);

      // Reschedule proactive refresh with the new expiry
      if (detail.exp) {
        scheduleProactiveRefresh(detail.exp);
      }
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
    };
  }, [authService, scheduleProactiveRefresh]);

  // Initialize auth state on mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Check if we're in impersonation mode (impersonation JWT in localStorage)
        const impersonationToken =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('auth_jwt')
            : null;

        if (impersonationToken) {
          // Impersonation mode — decode the impersonation JWT
          const isValid = authService.verifyToken(impersonationToken);
          if (isValid) {
            const targetUser = decodeUserFromToken(impersonationToken);
            const adminProfile = authService.getStoredAdminProfile();

            if (targetUser && adminProfile && isMounted) {
              dispatchAuth({
                type: 'IMPERSONATE_START',
                payload: { adminUser: adminProfile, targetUser },
              });
              return;
            }
          }
          // Impersonation token invalid — clear it and fall through
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('auth_jwt');
          }
          authService.clearAdminProfile();
        }

        // Normal flow — restore session from cached user profile.
        // The actual JWT is in the HttpOnly cookie (not JS-accessible).
        const cachedProfile = authService.getStoredUserProfile();

        if (cachedProfile && isMounted) {
          // Restore UI state immediately from cache (no loading flash)
          dispatchAuth({ type: 'AUTH_SUCCESS', payload: cachedProfile });

          // Schedule proactive refresh using cached expiry
          const expiry = authService.getStoredTokenExpiry();
          if (expiry) {
            const currentTime = Math.floor(Date.now() / 1000);
            if (expiry > currentTime) {
              // Token not expired yet — schedule refresh before expiry
              scheduleProactiveRefresh(expiry);

              // Fire a background refresh to pick up any server-side claim
              // changes (e.g. accessLevel promotion) that happened while the
              // user was away. The UI already shows the cached profile (no
              // loading flash), so this is a silent update.
              authService
                .refreshJwt()
                .then((freshToken) => {
                  if (!freshToken || !isMounted) return;
                  // Always reschedule proactive refresh when we have a fresh
                  // token, even if user decoding fails.
                  scheduleProactiveRefresh(freshToken);
                  const freshUser = decodeUserFromToken(freshToken);
                  if (freshUser) {
                    authService.storeUserProfile(freshUser);
                    dispatchAuth({
                      type: 'AUTH_SUCCESS',
                      payload: freshUser,
                    });
                  }
                })
                .catch(() => {
                  // Silently ignore — the cached profile is still valid
                });
            } else {
              // Token may be expired — attempt a silent refresh
              const newToken = await authService.refreshJwt();
              if (newToken && isMounted) {
                const refreshedUser = decodeUserFromToken(newToken);
                if (refreshedUser) {
                  authService.storeUserProfile(refreshedUser);
                  dispatchAuth({
                    type: 'AUTH_SUCCESS',
                    payload: refreshedUser,
                  });
                  scheduleProactiveRefresh(newToken);
                  return;
                }
              }
              // Refresh failed — clear state and require re-login
              authService.clearTokens();
              if (isMounted) {
                dispatchAuth({ type: 'AUTH_LOGOUT' });
              }
            }
          }
        }
        // No cached profile — user is not logged in (or never was on this device)
      } catch (error) {
        LOGGER.error('Auth initialization failed:', String(error));
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
      clearRefreshTimer();
    };
  }, [
    authService,
    clearRefreshTimer,
    decodeUserFromToken,
    scheduleProactiveRefresh,
  ]);

  const login = useCallback(
    async (email: string, password: string) => {
      dispatchAuth({ type: 'AUTH_START' });

      try {
        const userInfo = await authService.authenticateWithEmail(
          email,
          password,
        );
        authService.storeUserProfile(userInfo);
        dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
        const expiry = authService.getStoredTokenExpiry();
        if (expiry) scheduleProactiveRefresh(expiry);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Login failed';
        dispatchAuth({ type: 'AUTH_FAILURE', payload: errorMessage });
        throw error;
      }
    },
    [authService, scheduleProactiveRefresh],
  );

  const loginWithOAuth = useCallback(
    async (oauthResponse: OAuthResponse) => {
      dispatchAuth({ type: 'AUTH_START' });

      try {
        const userInfo = await authService.authenticateWithOAuth(oauthResponse);
        authService.storeUserProfile(userInfo);
        dispatchAuth({ type: 'AUTH_SUCCESS', payload: userInfo });
        const expiry = authService.getStoredTokenExpiry();
        if (expiry) scheduleProactiveRefresh(expiry);
      } catch (error) {
        // AuthService already logged this before rethrowing — no duplicate log here.
        const errorMessage =
          error instanceof Error ? error.message : 'OAuth login failed';
        dispatchAuth({ type: 'AUTH_FAILURE', payload: errorMessage });
        throw error;
      }
    },
    [authService, scheduleProactiveRefresh],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      clearRefreshTimer();
      // Clear server-side HttpOnly cookies first
      await authService.requestLogout();
      authService.clearTokens();
      // Also clear any impersonation state
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('admin_original_jwt');
      }
      dispatchAuth({ type: 'AUTH_LOGOUT' });
    } catch (error) {
      // Logout errors (network failure clearing server cookies) are not bugs — client state is already cleared.
      LOGGER.warn('Logout failed:', String(error));
    }
  }, [authService, clearRefreshTimer]);

  const clearError = useCallback(() => {
    dispatchAuth({ type: 'CLEAR_ERROR' });
  }, []);

  /**
   * Begin impersonating another user.  The calling user must be an admin.
   * Stores the current admin profile so impersonation can be reverted.
   * The admin's actual JWT stays safely in the HttpOnly cookie.
   *
   * @param impersonationToken - A signed JWT returned by the `impersonateUser` GraphQL mutation.
   */
  const impersonateUser = useCallback(
    (impersonationToken: string) => {
      // Use current auth state for admin info (can't read HttpOnly cookie JWT)
      const currentAdminUser = authState.user;
      if (!currentAdminUser) {
        LOGGER.error('impersonateUser: no current user in auth state');
        return;
      }

      const targetUser = decodeUserFromToken(impersonationToken);
      if (!targetUser) {
        LOGGER.error('impersonateUser: could not decode impersonation token');
        return;
      }

      // Save admin profile for restoration when impersonation ends
      authService.storeAdminProfile(currentAdminUser);

      // Store impersonation JWT in localStorage — Apollo sends it as Bearer
      // header, which takes priority over the HttpOnly cookie on the server.
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_jwt', impersonationToken);
      }

      dispatchAuth({
        type: 'IMPERSONATE_START',
        payload: { adminUser: currentAdminUser, targetUser },
      });

      // Flush any user-scoped caches (e.g. Apollo InMemoryCache) so the new
      // identity never receives another user's cached responses.
      void onUserSwitch?.();
    },
    [authService, authState.user, decodeUserFromToken, onUserSwitch],
  );

  /** Restore the original admin session, ending impersonation. */
  const stopImpersonating = useCallback(() => {
    // Restore admin profile from cache
    const adminProfile = authService.getStoredAdminProfile();

    if (!adminProfile) {
      LOGGER.error('stopImpersonating: no admin profile stored');
      return;
    }

    // Remove impersonation JWT from localStorage — requests will now use
    // the admin's HttpOnly cookie JWT automatically.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_jwt');
      localStorage.removeItem('admin_original_jwt'); // legacy cleanup
    }
    authService.clearAdminProfile();

    // Restore admin user profile for UI
    authService.storeUserProfile(adminProfile);

    dispatchAuth({ type: 'IMPERSONATE_STOP', payload: adminProfile });

    // Flush any user-scoped caches (e.g. Apollo InMemoryCache) so the restored
    // admin session never gets stale impersonated-user data.
    void onUserSwitch?.();
  }, [authService, onUserSwitch]);

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
