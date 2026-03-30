import { LOGGER } from '@legacy-sports/logging';
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
}

interface AuthTokens {
  jwt: string;
  refreshToken?: string;
}

/** localStorage key for cached user profile (non-sensitive, used for fast reload). */
const USER_PROFILE_KEY = 'ls_user_profile';
/** localStorage key for cached token expiry (seconds since epoch). */
const TOKEN_EXPIRY_KEY = 'ls_token_expiry';
/** localStorage key for admin profile during impersonation. */
const ADMIN_PROFILE_KEY = 'ls_admin_profile';

interface SecureOAuthResponse {
  jwt: string;
  refreshToken?: string;
  csrfToken?: string;
}

// Type for Vite environment configuration
interface ViteEnvironment {
  VITE_OAUTH_PROXY_URL?: string;
}

// Extended response interface that may include user data
interface ExtendedSecureOAuthResponse extends SecureOAuthResponse {
  user?: {
    id: number;
    email: string;
    username: string;
    accessLevel: 'none' | 'user' | 'admin';
  };
}

interface UnauthorizedUserError {
  error: string;
  message: string;
  userEmail?: string;
}

/**
 * Modern authentication service with secure user pre-authorization.
 *
 * This service now uses a single secure OAuth lambda that:
 * 1. Checks if the user exists in the database FIRST
 * 2. Only then validates OAuth credentials
 * 3. Returns JWT only for pre-authorized users
 *
 * This provides better security by preventing unauthorized users from
 * completing OAuth authentication, even with valid Google credentials.
 */
export class AuthService {
  private config: OAuthConfig;
  private oauthProxyUrl: string;

  constructor(config: OAuthConfig) {
    this.config = config;

    // Get OAuth lambda endpoint from environment
    this.oauthProxyUrl = this.getOAuthProxyUrl();
  }

  /**
   * Get OAuth Proxy Lambda URL from environment with fallback
   */
  private getOAuthProxyUrl(): string {
    // First check if it's provided in the config
    if (this.config.oauthProxyUrl) {
      return this.config.oauthProxyUrl;
    }

    // Check various environment variable patterns
    if (typeof process !== 'undefined' && process.env) {
      return (
        process.env.VITE_OAUTH_PROXY_URL ||
        process.env.REACT_APP_OAUTH_PROXY_URL ||
        process.env.OAUTH_PROXY_URL ||
        'http://localhost:5001'
      );
    }

    // Browser environment - check for Vite environment variables
    if (typeof window !== 'undefined') {
      // Check if we're in a Vite environment (browser build)
      // Use type-safe access to window environment
      const windowWithEnv = window as typeof window & {
        __VITE_ENV__?: ViteEnvironment;
      };
      const viteEnv = windowWithEnv.__VITE_ENV__;
      if (viteEnv?.VITE_OAUTH_PROXY_URL) {
        return viteEnv.VITE_OAUTH_PROXY_URL;
      }
    }

    return 'http://localhost:5001';
  }

  /**
   * Authenticate user with OAuth response through secure single-lambda flow
   */
  async authenticateWithOAuth(oauthResponse: OAuthResponse): Promise<User> {
    try {
      // Single call to secure OAuth lambda (checks user exists + validates OAuth)
      const authResult = await this.callSecureOAuth(oauthResponse);

      // Store authentication tokens securely
      this.storeTokens({
        jwt: authResult.jwt,
        refreshToken: authResult.refreshToken,
      });

      // Persist CSRF token from response body (cross-origin safe)
      if (authResult.csrfToken) {
        this.storeCsrfToken(authResult.csrfToken);
      }

      // Extract user from response or decode from JWT
      const user = authResult.user || this.getUserFromToken(authResult.jwt);

      return user;
    } catch (error) {
      LOGGER.error(
        'AuthService: Secure OAuth authentication failed:',
        String(error),
      );

      // Enhanced error handling for different failure scenarios
      const authError = this.handleAuthenticationError(error);
      throw authError;
    }
  }

  /**
   * Authenticate user with email/password through local authentication
   */
  async authenticateWithEmail(email: string, password: string): Promise<User> {
    try {
      const response = await fetch(`${this.oauthProxyUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          message?: string;
          error?: string;
        };
        throw new Error(errorData.message || errorData.error || 'Login failed');
      }

      const result = (await response.json()) as {
        jwt: string;
        csrfToken?: string;
      };

      // Store the JWT token
      this.storeTokens({ jwt: result.jwt });

      // Persist CSRF token from response body (cross-origin safe)
      if (result.csrfToken) {
        this.storeCsrfToken(result.csrfToken);
      }

      // Decode user info from JWT or fetch from user manager
      const user = this.getUserFromToken(result.jwt);

      return user;
    } catch (error) {
      LOGGER.error('AuthService: Email authentication failed:', String(error));
      throw new Error(
        error instanceof Error ? error.message : 'Email login failed',
      );
    }
  }

  /**
   * Call the secure OAuth Lambda that performs user pre-authorization + OAuth validation
   */
  private async callSecureOAuth(
    oauthResponse: OAuthResponse,
  ): Promise<ExtendedSecureOAuthResponse> {
    const requestBody: Record<string, string> = {};

    // Format request based on OAuth response type
    if (oauthResponse.code) {
      // Mobile flow - authorization code
      requestBody.code = oauthResponse.code;
    } else if (oauthResponse.credential) {
      // Web flow - ID token
      requestBody.credential = oauthResponse.credential;
    } else {
      throw new Error('Invalid OAuth response - missing code or credential');
    }

    const response = await fetch(`${this.oauthProxyUrl}/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(requestBody),
    });

    // Handle different response scenarios
    if (response.status === 403) {
      // User not pre-authorized
      const errorData = (await response.json()) as UnauthorizedUserError;
      throw new Error(
        errorData.message || 'User not authorized for this application',
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      let message = `Secure OAuth failed: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText) as { message?: string };
        if (errorData.message) {
          message = errorData.message;
        }
      } catch {
        message = `Secure OAuth failed: ${response.status} - ${errorText}`;
      }
      throw new Error(message);
    }

    const responseText = await response.text();

    const result = JSON.parse(responseText) as SecureOAuthResponse;

    if (!result.jwt) {
      throw new Error('Secure OAuth did not return JWT');
    }

    return result;
  }

  /**
   * Handle authentication errors with appropriate user-friendly messages
   */
  private handleAuthenticationError(error: unknown): Error {
    if (error instanceof Error) {
      // User authorization errors (403 responses)
      if (
        error.message.includes('User not authorized') ||
        error.message.includes('not pre-authorized')
      ) {
        return new Error(
          'Access denied: Your account is not authorized to access this application. Please contact an administrator for access.',
        );
      }

      // OAuth validation errors (400 responses)
      if (
        error.message.includes('Invalid ID token') ||
        error.message.includes('Invalid authorization code')
      ) {
        return new Error(
          'Authentication failed: Invalid credentials. Please try signing in again.',
        );
      }

      // Network or server errors (500 responses)
      if (
        error.message.includes('failed: 500') ||
        error.message.includes('Internal Server Error')
      ) {
        return new Error(
          'Authentication service temporarily unavailable. Please try again in a few moments.',
        );
      }

      // Return the original error if it's already user-friendly
      return error;
    }

    // Fallback for unknown error types
    return new Error('Authentication failed. Please try again.');
  }

  /**
   * Extract user information from JWT token
   */
  private getUserFromToken(jwt: string): User {
    try {
      // Simple JWT decode (base64 decode the payload)
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as {
        id?: number;
        email?: string;
        username?: string;
        name?: string;
        picture?: string;
        accessLevel?: 'none' | 'user' | 'admin';
      };

      const user = {
        id: payload.id ?? 0,
        email: payload.email ?? '',
        username: payload.username ?? payload.name ?? 'Unknown',
        picture: payload.picture,
        accessLevel: payload.accessLevel ?? 'user',
      };

      return user;
    } catch (error) {
      LOGGER.error('Failed to decode JWT:', String(error));
      throw new Error('Invalid authentication token');
    }
  }

  /**
   * Store authentication tokens securely (platform-specific).
   *
   * On web, the JWT is now stored in an HttpOnly cookie set by the server.
   * We no longer persist it in localStorage to prevent XSS token theft.
   * Only the refresh token (if present) is kept in localStorage for mobile.
   */
  private storeTokens(tokens: AuthTokens): void {
    try {
      if (typeof localStorage !== 'undefined') {
        // Do NOT store JWT in localStorage — it's now in an HttpOnly cookie.
        // Only store refresh token for mobile flows that need it.
        if (tokens.refreshToken) {
          localStorage.setItem('auth_refresh_token', tokens.refreshToken);
        }
        // Store the token expiry so the frontend can schedule proactive refresh.
        try {
          const parts = tokens.jwt.split('.');
          if (parts.length === 3) {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
            const payload = JSON.parse(atob(padded)) as { exp?: number };
            if (payload.exp) {
              localStorage.setItem(TOKEN_EXPIRY_KEY, String(payload.exp));
            }
          }
        } catch {
          // Token expiry extraction failed — proactive refresh won't schedule
        }
      }
    } catch (error) {
      LOGGER.error('Failed to store auth tokens:', String(error));
    }
  }

  /**
   * Get stored JWT token.
   *
   * On web, the JWT is in an HttpOnly cookie (not accessible to JS).
   * This method only returns a token if one was manually stored in
   * localStorage (e.g. during admin impersonation).
   */
  getStoredToken(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('auth_jwt');
      }
      return null;
    } catch (error) {
      LOGGER.error('Failed to retrieve stored token:', String(error));
      return null;
    }
  }

  /**
   * Clear stored tokens and cached profile (logout)
   */
  clearTokens(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_jwt');
        localStorage.removeItem('auth_refresh_token');
        localStorage.removeItem(USER_PROFILE_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        localStorage.removeItem(ADMIN_PROFILE_KEY);
        localStorage.removeItem('ls_csrf_token');
      }
      // Also clear the cross-origin CSRF token from sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('ls_csrf_token');
      }
      this.csrfTokenFallback = '';
      this.csrfStaleStorageValue = null;
    } catch (error) {
      LOGGER.error('Failed to clear auth tokens:', String(error));
    }
  }

  /**
   * Verify if current token is still valid (local validation only for better performance)
   */
  verifyToken(token?: string): boolean {
    const jwt = token || this.getStoredToken();
    if (!jwt) return false;

    try {
      // Local JWT validation - check if token is properly formatted and not expired
      return this.isTokenValidLocally(jwt);
    } catch (error) {
      LOGGER.error('Token verification failed:', String(error));
      return false;
    }
  }

  /**
   * Returns true if the stored (or provided) JWT has expired but its signature
   * is otherwise valid (i.e. it is refreshable).
   */
  isTokenExpired(token?: string): boolean {
    const jwt = token || this.getStoredToken();
    if (!jwt) return false;

    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as { exp?: number };

      if (!payload.exp) return false;

      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp <= currentTime;
    } catch {
      return false;
    }
  }

  /**
   * Silently refresh an expired JWT by calling the /oauth/refresh-jwt endpoint.
   * The server reads the JWT from the HttpOnly cookie. During impersonation,
   * the impersonation token from localStorage is sent as a Bearer header.
   *
   * @returns The new JWT string on success, or null if refresh is not possible.
   */
  async refreshJwt(): Promise<string | null> {
    try {
      // During impersonation, send the impersonation JWT as Authorization header
      const impersonationToken =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('auth_jwt')
          : null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (impersonationToken) {
        headers['Authorization'] = `Bearer ${impersonationToken}`;
      }

      // Attach CSRF double-submit header so the server can validate the request
      const csrf = this.getCsrfToken();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }

      const response = await fetch(`${this.oauthProxyUrl}/refresh-jwt`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        LOGGER.warn(
          'AuthService: JWT refresh failed with status',
          response.status,
        );
        return null;
      }

      const result = (await response.json()) as {
        jwt?: string;
        csrfToken?: string;
      };

      if (!result.jwt) {
        LOGGER.warn('AuthService: JWT refresh endpoint did not return a jwt');
        return null;
      }

      // Persist the refreshed CSRF token so subsequent requests include it
      if (result.csrfToken) {
        this.storeCsrfToken(result.csrfToken);
      }

      // Persist the expiry so subsequent proactive refresh can reschedule
      this.storeTokens({ jwt: result.jwt });

      return result.jwt;
    } catch (error) {
      LOGGER.error('AuthService: JWT refresh request failed:', String(error));
      return null;
    }
  }

  /**
   * Verify if current token is still valid (remote verification - use for critical operations)
   */
  async verifyTokenRemote(token?: string): Promise<boolean> {
    const jwt = token || this.getStoredToken();
    if (!jwt) return false;

    try {
      const response = await fetch(`${this.oauthProxyUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
      });

      return response.ok;
    } catch (error) {
      LOGGER.error('Remote token verification failed:', String(error));
      return false;
    }
  }

  /**
   * Local JWT validation - checks format and expiration without API call
   */
  private isTokenValidLocally(jwt: string): boolean {
    try {
      // Check JWT format
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        return false;
      }

      // Decode payload to check expiration
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as {
        exp?: number;
        iat?: number;
        [key: string]: unknown;
      };

      // Check if token has expiration time
      if (!payload.exp) {
        // If no expiration time, consider token valid (some JWTs may not have exp)
        return true;
      }

      // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp <= currentTime) {
        return false;
      }

      // Token is valid and not expired
      return true;
    } catch (error) {
      LOGGER.error('Failed to validate JWT locally:', String(error));
      return false;
    }
  }

  // ─── User profile caching ───────────────────────────────────────────────

  /**
   * Store a decoded user profile in localStorage for fast session restore
   * on page reload. This is non-sensitive data — the actual JWT stays in
   * the HttpOnly cookie.
   */
  storeUserProfile(user: User): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
      }
    } catch (error) {
      LOGGER.error('Failed to store user profile:', String(error));
    }
  }

  /**
   * Get cached user profile from localStorage.
   * Returns null if no profile is cached.
   */
  getStoredUserProfile(): User | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(USER_PROFILE_KEY);
        if (raw) return JSON.parse(raw) as User;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the cached token expiry (seconds since epoch) from localStorage.
   */
  getStoredTokenExpiry(): number | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(TOKEN_EXPIRY_KEY);
        if (raw) return Number(raw);
      }
      return null;
    } catch {
      return null;
    }
  }

  // ─── Admin impersonation profile ────────────────────────────────────────

  storeAdminProfile(user: User): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(user));
      }
    } catch (error) {
      LOGGER.error('Failed to store admin profile:', String(error));
    }
  }

  getStoredAdminProfile(): User | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
        if (raw) return JSON.parse(raw) as User;
      }
      return null;
    } catch {
      return null;
    }
  }

  clearAdminProfile(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ADMIN_PROFILE_KEY);
      }
    } catch {
      // ignore
    }
  }

  // ─── Server-side logout ─────────────────────────────────────────────────

  /**
   * Call the server logout endpoint to clear HttpOnly cookies.
   * This must be called before clearing client-side state.
   */
  async requestLogout(): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      const csrf = this.getCsrfToken();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }

      await fetch(`${this.oauthProxyUrl}/logout`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch (error) {
      LOGGER.error('AuthService: Logout request failed:', String(error));
    }
  }

  // ─── CSRF helper ──────────────────────────────────────────────────────

  /** In-memory fallback when localStorage is unavailable */
  private csrfTokenFallback = '';

  /** Stale localStorage value after a setItem failure; null when no failure pending */
  private csrfStaleStorageValue: string | null = null;

  /**
   * Read the CSRF double-submit token. Checks localStorage first (shared
   * source of truth across all code paths), then in-memory fallback, then
   * document.cookie.
   *
   * localStorage is checked before in-memory because multiple independent
   * code paths update the CSRF token (Apollo error link via csrf.ts and
   * AuthService proactive refresh). Each has its own in-memory variable,
   * but both write to the same localStorage key. Reading localStorage first
   * ensures we always get the latest token, preventing stale in-memory values
   * from causing CSRF mismatches after concurrent refresh races.
   */
  private getCsrfToken(): string {
    // 1. localStorage (single source of truth shared between all code paths).
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('ls_csrf_token');
        if (stored) {
          // If the backing cookie has been cleared (logout / expiry),
          // the localStorage value is stale — discard it.
          if (this.isCsrfCookieGone()) {
            try {
              localStorage.removeItem('ls_csrf_token');
            } catch {
              // best-effort cleanup
            }
            this.csrfTokenFallback = '';
            this.csrfStaleStorageValue = null;
            return '';
          }

          if (
            this.csrfStaleStorageValue !== null &&
            stored === this.csrfStaleStorageValue
          ) {
            // localStorage still holds the stale value — prefer in-memory.
            if (this.csrfTokenFallback) return this.csrfTokenFallback;
          }
          // Either no write failure, or localStorage was updated by another
          // code path (recovered) — use the stored value.
          this.csrfStaleStorageValue = null;
          this.csrfTokenFallback = stored;
          return stored;
        }
      }
    } catch {
      // localStorage not available — fall through to in-memory
    }

    // 2. In-memory fallback (when localStorage is unavailable or after write failure)
    if (this.csrfTokenFallback) return this.csrfTokenFallback;

    // 3. Cookie fallback (only works when API is same-origin)
    if (typeof document === 'undefined') return '';
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('ls_csrf='));
    return match ? match.substring('ls_csrf='.length) : '';
  }

  /**
   * Check whether the ls_csrf cookie has been removed (e.g. after logout or
   * server-side expiry). Returns true when we can confirm the cookie is absent;
   * returns false (safe default) when cookie inspection is unavailable.
   */
  private isCsrfCookieGone(): boolean {
    try {
      if (typeof document === 'undefined') return false;
      return !document.cookie
        .split(';')
        .some((c) => c.trim().startsWith('ls_csrf='));
    } catch {
      return false;
    }
  }

  /**
   * Store the CSRF token in localStorage so it persists across browser
   * restarts (matching auth cookie lifetime). Falls back to in-memory.
   */
  private storeCsrfToken(token: string): void {
    this.csrfTokenFallback = token;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ls_csrf_token', token);
        this.csrfStaleStorageValue = null;
      }
    } catch {
      try {
        this.csrfStaleStorageValue = localStorage.getItem('ls_csrf_token');
      } catch {
        this.csrfStaleStorageValue = '';
      }
    }
  }
}
