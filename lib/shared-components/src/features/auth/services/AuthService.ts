import type {
  OAuthConfig,
  OAuthResponse,
} from '../../../platform-components/types';

interface User {
  id: number;
  email: string;
  username: string;
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

// Type for import.meta environment access
interface ImportMetaEnv {
  VITE_OAUTH_PROXY_URL?: string;
}

interface ImportMeta {
  env?: ImportMetaEnv;
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

    // Browser environment - use direct import.meta.env access with fallback
    try {
      const env = (import.meta as ImportMeta)?.env;
      if (env?.VITE_OAUTH_PROXY_URL) {
        return env.VITE_OAUTH_PROXY_URL;
      }
    } catch {
      // Fallback if import.meta is not available
    }

    return 'http://localhost:5001';
  }

  /**
   * Authenticate user with OAuth response through secure single-lambda flow
   */
  async authenticateWithOAuth(oauthResponse: OAuthResponse): Promise<User> {
    try {
      console.log(
        'AuthService: Processing OAuth response through secure single-lambda flow',
      );

      // Single call to secure OAuth lambda (checks user exists + validates OAuth)
      console.log('Calling secure OAuth Lambda...');
      const authResult = await this.callSecureOAuth(oauthResponse);

      // Store authentication tokens securely
      this.storeTokens({
        jwt: authResult.jwt,
        refreshToken: authResult.refreshToken,
      });

      // Extract user from response or decode from JWT
      const user = authResult.user || this.getUserFromToken(authResult.jwt);

      console.log('AuthService: Secure OAuth authentication successful');
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
      console.log('AuthService: Processing email/password login');

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

    console.log('Calling Secure OAuth Lambda:', this.oauthProxyUrl);
    console.log('Request body:', requestBody);

    const response = await fetch(`${this.oauthProxyUrl}/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('OAuth Lambda response status:', response.status);
    console.log('OAuth Lambda response headers:', response.headers);

    // Handle different response scenarios
    if (response.status === 403) {
      // User not pre-authorized
      const errorData = (await response.json()) as UnauthorizedUserError;
      console.log('403 response data:', errorData);
      throw new Error(
        errorData.message || 'User not authorized for this application',
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Non-OK response text:', errorText);
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
    console.log('OAuth Lambda success response:', responseText);

    const result = JSON.parse(responseText) as SecureOAuthResponse;

    if (!result.jwt) {
      console.log('No JWT in response:', result);
      throw new Error('Secure OAuth did not return JWT');
    }

    console.log('OAuth Lambda returned JWT successfully');
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
        accessLevel?: 'none' | 'user' | 'admin';
      };

      return {
        id: payload.id ?? 0,
        email: payload.email ?? '',
        username: payload.username ?? payload.name ?? 'Unknown',
        accessLevel: payload.accessLevel ?? 'user',
      };
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
      } else {
        // Mobile storage would use SecureStorageProvider
        console.log('Tokens would be stored in secure storage:', {
          hasJwt: !!tokens.jwt,
          hasRefresh: !!tokens.refreshToken,
        });
      }
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
   * Verify if current token is still valid
   */
  async verifyToken(token?: string): Promise<boolean> {
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
      console.error('Token verification failed:', error);
      return false;
    }
  }
}
