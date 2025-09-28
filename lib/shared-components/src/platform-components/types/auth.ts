/**
 * Google Sign-In (GSI) specific configuration
 */
export interface GSIConfig {
  /** Enable One Tap sign-in for returning users */
  oneTap?: boolean;
  /** Auto-select single account when available */
  autoSelect?: boolean;
  /** Close One Tap when user clicks outside */
  cancelOnTapOutside?: boolean;
  /** Use popup mode for OAuth flow */
  uxMode?: 'popup' | 'redirect';
}

/**
 * OAuth configuration interface
 */
export interface OAuthConfig {
  /** Google OAuth Client ID */
  googleClientId: string;
  /** OAuth Proxy Lambda URL (optional - will auto-detect from environment if not provided) */
  oauthProxyUrl?: string;
  /** Additional configuration options */
  additionalScopes?: string[];
  /** Offline access for refresh tokens */
  offlineAccess?: boolean;
  /** Google Sign-In (GSI) configuration - One Tap enabled by default */
  gsi?: GSIConfig;
}

/**
 * OAuth response from sign-in
 */
export interface OAuthResponse {
  /** Authorization code or credential from OAuth provider */
  code?: string;
  /** ID token credential (web) */
  credential?: string;
  /** Server auth code (mobile) */
  serverAuthCode?: string;
  /** User info (optional) */
  user?: {
    id: string;
    email?: string;
    name?: string;
    photo?: string;
  };
}

/**
 * OAuth error codes
 */
export enum OAuthErrorCode {
  SIGN_IN_CANCELLED = 'SIGN_IN_CANCELLED',
  IN_PROGRESS = 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE = 'PLAY_SERVICES_NOT_AVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * OAuth error with code and message
 */
export interface OAuthError {
  code: OAuthErrorCode;
  message: string;
  originalError?: unknown;
}

/**
 * Cross-platform OAuth interface
 */
export interface OAuthProvider {
  /**
   * Configure OAuth provider with settings
   */
  configure(config: OAuthConfig): Promise<void>;

  /**
   * Check if OAuth provider is available on this platform
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initiate sign-in flow
   */
  signIn(): Promise<OAuthResponse>;

  /**
   * Sign out the current user
   */
  signOut(): Promise<void>;

  /**
   * Check if user is currently signed in
   */
  isSignedIn(): Promise<boolean>;

  /**
   * Get current user info (if signed in)
   */
  getCurrentUser(): Promise<OAuthResponse['user'] | null>;
}

/**
 * Secure storage interface for cross-platform token storage
 */
export interface ISecureStorage {
  /**
   * Store a value securely
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Retrieve a value securely
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Remove a specific item
   */
  removeItem(key: string): Promise<void>;

  /**
   * Clear all stored items
   */
  clear(): Promise<void>;

  /**
   * Check if secure storage is available
   */
  isAvailable(): Promise<boolean>;
}
