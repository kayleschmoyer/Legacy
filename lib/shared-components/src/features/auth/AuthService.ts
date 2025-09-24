import { getJwt, LegacySportsJwt, Secret } from './AuthHooks';
import {
  OAuthProvider,
  SecureStorageProvider,
} from '../../platform-components';

// Type-safe casts for platform components
const secureStorage = SecureStorageProvider;
const oauthProvider = OAuthProvider;

export interface AuthConfig {
  oauthProxyUrl: string;
  googleClientId: string;
}

interface TokenResponse {
  jwt: string;
  googleJwt?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: LegacySportsJwt | null;
  isLoading: boolean;
  error: string | null;
}

export class AuthService {
  private config: AuthConfig;
  private listeners: Set<(state: AuthState) => void> = new Set();
  private currentState: AuthState = {
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null,
  };

  constructor(config: AuthConfig) {
    this.config = config;
    // Initialize async without awaiting in constructor
    void this.initialize();
  }

  private async initialize() {
    try {
      const user = await getJwt();
      this.updateState({
        isAuthenticated: !!user,
        user,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to initialize auth state:', error);
      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Initialization failed',
      });
    }
  }

  private updateState(newState: Partial<AuthState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  public subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.currentState);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AuthState {
    return { ...this.currentState };
  }

  public async login(authorizationCode: string): Promise<void> {
    try {
      this.updateState({ isLoading: true, error: null });

      const response = await fetch(this.config.oauthProxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: authorizationCode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OAuth proxy responded with status ${response.status}: ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as TokenResponse;

      if (!tokenData.jwt) {
        throw new Error('No JWT received from OAuth proxy');
      }

      // Store tokens securely
      await secureStorage.setItem(Secret.INTERNAL_JWT, tokenData.jwt);

      if (tokenData.googleJwt) {
        await secureStorage.setItem(Secret.GOOGLE_JWT, tokenData.googleJwt);
      }

      // Get the decoded user info
      const user = await getJwt();

      this.updateState({
        isAuthenticated: true,
        user,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Login failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Login failed';

      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: errorMessage,
      });

      throw error;
    }
  }

  public async logout(): Promise<void> {
    try {
      this.updateState({ isLoading: true, error: null });

      // Clear stored tokens
      await secureStorage.clear();

      // Sign out from platform-specific services
      try {
        await oauthProvider.signOut();
      } catch (error) {
        console.warn('Failed to sign out from OAuth provider:', error);
      }

      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Logout failed';

      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: errorMessage,
      });
    }
  }

  public async refreshToken(): Promise<void> {
    try {
      this.updateState({ isLoading: true, error: null });

      // Check if we still have a valid token
      const user = await getJwt();

      if (user) {
        this.updateState({
          isAuthenticated: true,
          user,
          isLoading: false,
          error: null,
        });
      } else {
        // No valid token found
        this.updateState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      });
    }
  }

  public async checkAuthStatus(): Promise<boolean> {
    try {
      const user = await getJwt();
      const isAuthenticated = !!user;

      this.updateState({
        isAuthenticated,
        user,
        isLoading: false,
        error: null,
      });

      return isAuthenticated;
    } catch (error) {
      console.error('Auth status check failed:', error);
      this.updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Auth check failed',
      });

      return false;
    }
  }
}

// Create a singleton instance
let authServiceInstance: AuthService | null = null;

export function createAuthService(config: AuthConfig): AuthService {
  if (authServiceInstance) {
    console.warn('AuthService already exists. Returning existing instance.');
    return authServiceInstance;
  }

  authServiceInstance = new AuthService(config);
  return authServiceInstance;
}

export function getAuthService(): AuthService | null {
  return authServiceInstance;
}

export function resetAuthService(): void {
  authServiceInstance = null;
}
