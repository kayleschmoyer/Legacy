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
  /** In-memory JWT, available after login or first token refresh. Null on initial page load until refresh completes. */
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithOAuth: (oauthResponse: OAuthResponse) => Promise<void>;
  loginWithProvider: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** True when an admin is currently acting as another user. */
  isImpersonating: boolean;
  /** The original admin user who initiated impersonation. */
  adminUser: User | null;
  /** Begin impersonating another user. Sets HttpOnly cookie server-side. */
  impersonateUser: (userId: number) => Promise<void>;
  /** Restore the original admin session. Clears HttpOnly cookie server-side. */
  stopImpersonating: () => Promise<void>;
  /** Update the current user's profile fields (e.g. after a username change). */
  updateUserProfile: (
    updates: Partial<Pick<User, 'username' | 'picture'>>,
  ) => void;
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
  /** In-memory JWT, available after login or first token refresh. */
  token: string | null;
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOKEN_UPDATED'; payload: string | null }
  | {
      type: 'USER_PROFILE_UPDATED';
      payload: Partial<Pick<User, 'username' | 'picture'>>;
    }
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
  token: null,
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
        token: null,
      };

    case 'TOKEN_UPDATED':
      return { ...state, token: action.payload };

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

    case 'USER_PROFILE_UPDATED':
      return state.user
        ? { ...state, user: { ...state.user, ...action.payload } }
        : state;

    case 'IMPERSONATE_START':
      return {
        ...state,
        isImpersonating: true,
        adminUser: action.payload.adminUser,
        user: action.payload.targetUser,
        // Clear in-memory token so WebSocket and other consumers that pass
        // token via query string don't accidentally authenticate as the admin
        // instead of the impersonated user (auth uses HttpOnly cookies now).
        token: null,
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
  const { user, isLoading, error, isImpersonating, adminUser, token } =
    authState;

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
            dispatchAuth({ type: 'TOKEN_UPDATED', payload: newToken });
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
      // Check stored admin profile instead of state to avoid stale closures.
      if (authService.getStoredAdminProfile()) return;

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

  // ─── Listen for session-expired events from Apollo error link ───────────────
  // When silentlyRefreshJwt() receives a 401/403 from the refresh endpoint,
  // it dispatches auth:session-expired to signal that the server has definitively
  // rejected the session. Clear local state so the user is prompted to log in
  // again rather than being stuck in a 401 retry loop with stale credentials.
  useEffect(() => {
    const handleSessionExpired = () => {
      // Cancel any scheduled proactive refresh so it cannot fire after logout
      // and inadvertently re-trigger network requests or update auth state.
      clearRefreshTimer();
      authService.clearTokens();
      dispatchAuth({ type: 'AUTH_LOGOUT' });
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, [authService, clearRefreshTimer]);

  // Initialize auth state on mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Check if we're in impersonation mode by looking for a stored admin
        // profile. The actual impersonation JWT is in an HttpOnly cookie
        // (ls_imp_jwt) — not accessible to JavaScript.
        const adminProfile = authService.getStoredAdminProfile();
        const impersonatedUserProfile =
          authService.getStoredImpersonatedUserProfile();

        if (adminProfile && impersonatedUserProfile && isMounted) {
          // Impersonation was active before the page reload.
          // Restore the UI state from cached profiles; the HttpOnly
          // ls_imp_jwt cookie authenticates requests automatically.
          dispatchAuth({
            type: 'IMPERSONATE_START',
            payload: {
              adminUser: adminProfile,
              targetUser: impersonatedUserProfile,
            },
          });
          return;
        } else if (adminProfile) {
          // Admin profile stored but no impersonated user — stale state.
          // Clear it and fall through to normal auth.
          authService.clearAdminProfile();
          authService.clearImpersonatedUserProfile();
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
                  dispatchAuth({ type: 'TOKEN_UPDATED', payload: freshToken });
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
                dispatchAuth({ type: 'TOKEN_UPDATED', payload: newToken });
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
        // Prefer the in-memory JWT from the login response over localStorage —
        // on web the JWT is no longer persisted to localStorage (it lives in
        // an HttpOnly cookie), so getStoredToken() would return null and leave
        // authState.token null, breaking consumers like WebSocket auth.
        const jwt = authService.getCurrentToken();
        if (jwt) dispatchAuth({ type: 'TOKEN_UPDATED', payload: jwt });
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
        // See login() above — prefer in-memory JWT since getStoredToken()
        // returns null on web (JWT lives in an HttpOnly cookie).
        const jwt = authService.getCurrentToken();
        if (jwt) dispatchAuth({ type: 'TOKEN_UPDATED', payload: jwt });
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
   * Calls POST /oauth/impersonate to set an HttpOnly cookie (ls_imp_jwt),
   * then updates client state with the impersonated user profile.
   */
  const impersonateUser = useCallback(
    async (userId: number) => {
      // Use current auth state for admin info (can't read HttpOnly cookie JWT)
      const currentAdminUser = authState.user;
      if (!currentAdminUser) {
        LOGGER.error('impersonateUser: no current user in auth state');
        return;
      }

      // Call server to set the HttpOnly impersonation cookie
      const targetUser = await authService.startImpersonation(userId);

      // Save admin profile for restoration when impersonation ends
      authService.storeAdminProfile(currentAdminUser);

      // Store the impersonated user profile so we can restore the UI state
      // on page reload. No JWT is stored — auth uses the HttpOnly cookie.
      authService.storeImpersonatedUserProfile(targetUser);

      dispatchAuth({
        type: 'IMPERSONATE_START',
        payload: { adminUser: currentAdminUser, targetUser },
      });

      // Flush any user-scoped caches (e.g. Apollo InMemoryCache) so the new
      // identity never receives another user's cached responses.
      void onUserSwitch?.();
    },
    [authService, authState.user, onUserSwitch],
  );

  /**
   * Restore the original admin session, ending impersonation.
   * Calls POST /oauth/stop-impersonate to clear the ls_imp_jwt cookie
   * server-side, then updates client state.
   */
  const stopImpersonating = useCallback(async () => {
    // Restore admin profile from cache
    const adminProfile = authService.getStoredAdminProfile();

    if (!adminProfile) {
      LOGGER.error('stopImpersonating: no admin profile stored');
      return;
    }

    // Clear the impersonation cookie server-side
    try {
      await authService.stopImpersonation();
    } catch (err) {
      LOGGER.error(
        'stopImpersonating: failed to clear server cookie; keeping impersonation state active',
        String(err),
      );
      throw err;
    }

    // Clean up legacy localStorage keys if present
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_jwt');
      localStorage.removeItem('admin_original_jwt');
    }
    authService.clearAdminProfile();
    authService.clearImpersonatedUserProfile();

    // Restore admin user profile for UI
    authService.storeUserProfile(adminProfile);

    dispatchAuth({ type: 'IMPERSONATE_STOP', payload: adminProfile });

    // Flush any user-scoped caches (e.g. Apollo InMemoryCache) so the restored
    // admin session never gets stale impersonated-user data.
    void onUserSwitch?.();
  }, [authService, onUserSwitch]);

  const updateUserProfile = useCallback(
    (updates: Partial<Pick<User, 'username' | 'picture'>>) => {
      dispatchAuth({ type: 'USER_PROFILE_UPDATED', payload: updates });

      // Persist only for the active non-impersonated user so we never
      // overwrite a cached admin profile with impersonated-user updates.
      if (!user || isImpersonating) {
        return;
      }

      const current = authService.getStoredUserProfile() ?? user;
      if (current.id === user.id) {
        authService.storeUserProfile({ ...current, ...updates });
      }
    },
    [authService, isImpersonating, user],
  );

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
      token,
      login,
      loginWithOAuth,
      loginWithProvider,
      logout,
      clearError,
      isImpersonating,
      adminUser,
      impersonateUser,
      stopImpersonating,
      updateUserProfile,
    }),
    [
      user,
      isLoading,
      error,
      config,
      token,
      login,
      loginWithOAuth,
      loginWithProvider,
      logout,
      clearError,
      isImpersonating,
      adminUser,
      impersonateUser,
      stopImpersonating,
      updateUserProfile,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export default useAuth;
