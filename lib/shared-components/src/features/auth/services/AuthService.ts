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

interface SecureOAuthResponse {
  jwt: string;
  refreshToken?: string;
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

      // Extract user from response or decode from JWT
      const user = authResult.user || this.getUserFromToken(authResult.jwt);

      return user;
    } catch (error) {
      console.error('AuthService: Secure OAuth authentication failed:', error);

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
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || 'Login failed');
      }

      const result = (await response.json()) as { jwt: string };

      // Store the JWT token
      this.storeTokens({ jwt: result.jwt });

      // Decode user info from JWT or fetch from user manager
      const user = this.getUserFromToken(result.jwt);

      return user;
    } catch (error) {
      console.error('AuthService: Email authentication failed:', error);
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
      try {
        const errorData = JSON.parse(errorText) as { message?: string };
        throw new Error(
          errorData.message || `Secure OAuth failed: ${response.status}`,
        );
      } catch {
        throw new Error(
          `Secure OAuth failed: ${response.status} - ${errorText}`,
        );
      }
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
      console.error('Failed to decode JWT:', error);
      throw new Error('Invalid authentication token');
    }
  }

  /**
   * Store authentication tokens securely (platform-specific)
   */
  private storeTokens(tokens: AuthTokens): void {
    try {
      // Use secure storage for tokens
      if (typeof localStorage !== 'undefined') {
        // Web storage
        localStorage.setItem('auth_jwt', tokens.jwt);
        if (tokens.refreshToken) {
          localStorage.setItem('auth_refresh_token', tokens.refreshToken);
        }
      }
      // Mobile storage would use SecureStorageProvider
    } catch (error) {
      console.error('Failed to store auth tokens:', error);
      // Don't throw here - authentication was successful, storage is optional
    }
  }

  /**
   * Get stored JWT token
   */
  getStoredToken(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('auth_jwt');
      }
      return null;
    } catch (error) {
      console.error('Failed to retrieve stored token:', error);
      return null;
    }
  }

  /**
   * Clear stored tokens (logout)
   */
  clearTokens(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_jwt');
        localStorage.removeItem('auth_refresh_token');
      }
    } catch (error) {
      console.error('Failed to clear auth tokens:', error);
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
      console.error('Token verification failed:', error);
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
   * The caller does NOT need a Google refresh token — the endpoint re-validates
   * the user via the database.
   *
   * @returns The new JWT string on success, or null if refresh is not possible.
   */
  async refreshJwt(): Promise<string | null> {
    const currentToken = this.getStoredToken();
    if (!currentToken) return null;

    try {
      const response = await fetch(`${this.oauthProxyUrl}/refresh-jwt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        console.warn(
          'AuthService: JWT refresh failed with status',
          response.status,
        );
        return null;
      }

      const result = (await response.json()) as { jwt?: string };

      if (!result.jwt) {
        console.warn('AuthService: JWT refresh endpoint did not return a jwt');
        return null;
      }

      // Persist the new token so subsequent requests use it immediately
      this.storeTokens({ jwt: result.jwt });

      return result.jwt;
    } catch (error) {
      console.error('AuthService: JWT refresh request failed:', error);
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
      console.error('Remote token verification failed:', error);
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
      console.error('Failed to validate JWT locally:', error);
      return false;
    }
  }
}
