import {
  OAuthConfig,
  OAuthErrorCode,
  OAuthProvider,
  OAuthResponse,
} from '../types/auth';

// Google Identity Services types
interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GooglePromptNotification {
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getMomentType: () => string;
}

interface GoogleIdentityServices {
  google?: {
    accounts?: {
      id?: {
        initialize: (config: {
          client_id: string;
          auto_select: boolean;
          callback: (response: GoogleCredentialResponse) => void;
        }) => void;
        disableAutoSelect: () => void;
        prompt: (
          callback?: (notification: GooglePromptNotification) => void,
        ) => void;
      };
    };
  };
}

class OAuthErrorClass extends Error {
  constructor(
    public code: OAuthErrorCode,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices['google'];
  }
}

/**
 * Web OAuth implementation using Google Identity Services
 */
export class WebOAuthProvider implements OAuthProvider {
  private isConfigured = false;
  private config?: OAuthConfig;

  async configure(config: OAuthConfig): Promise<void> {
    this.config = config;

    try {
      // Load Google Identity Services if not already loaded
      await this.loadGoogleIdentityServices();

      // Initialize Google OAuth
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          callback: () => {
            // No-op callback for initial configuration
          },
        });
        this.isConfigured = true;
      } else {
        throw new Error('Google Identity Services not available');
      }
    } catch (error) {
      throw this.createOAuthError(
        OAuthErrorCode.CONFIGURATION_ERROR,
        'Failed to configure OAuth provider',
        error,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      await this.loadGoogleIdentityServices();
      return !!window.google?.accounts?.id;
    } catch {
      return false;
    }
  }

  async signIn(): Promise<OAuthResponse> {
    if (!this.isConfigured || !this.config) {
      throw this.createOAuthError(
        OAuthErrorCode.CONFIGURATION_ERROR,
        'OAuth provider not configured',
      );
    }

    const config = this.config; // Capture config for TypeScript flow analysis

    return new Promise((resolve, reject) => {
      try {
        if (typeof window === 'undefined' || !window.google?.accounts?.id) {
          reject(
            this.createOAuthError(
              OAuthErrorCode.CONFIGURATION_ERROR,
              'Google Identity Services not available',
            ),
          );
          return;
        }

        // Set up the callback for the credential response
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          callback: (response: GoogleCredentialResponse) => {
            if (response.credential) {
              resolve({
                credential: response.credential,
                code: response.credential, // Use credential as code for consistency
              });
            } else {
              reject(
                this.createOAuthError(
                  OAuthErrorCode.UNKNOWN_ERROR,
                  'No credential received from Google',
                ),
              );
            }
          },
        });

        // Show the One Tap prompt
        window.google.accounts.id.prompt(
          (notification: GooglePromptNotification) => {
            if (notification.isNotDisplayed()) {
              // Fallback to popup if One Tap is not displayed
              this.showPopupSignIn().then(resolve).catch(reject);
            } else if (notification.isSkippedMoment()) {
              // User closed the prompt, show popup as fallback
              this.showPopupSignIn().then(resolve).catch(reject);
            } else if (notification.isDismissedMoment()) {
              reject(
                this.createOAuthError(
                  OAuthErrorCode.SIGN_IN_CANCELLED,
                  'Sign-in was dismissed by user',
                ),
              );
            }
          },
        );
      } catch (error) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.UNKNOWN_ERROR,
            'Failed to initiate sign-in',
            error,
          ),
        );
      }
    });
  }

  private async showPopupSignIn(): Promise<OAuthResponse> {
    return new Promise((resolve, reject) => {
      if (!this.config) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'OAuth provider not configured',
          ),
        );
        return;
      }

      // Create a popup window for OAuth flow
      const authUrl =
        `https://accounts.google.com/oauth/authorize?` +
        `client_id=${encodeURIComponent(this.config.googleClientId)}&` +
        `redirect_uri=${encodeURIComponent(window.location.origin)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `access_type=${this.config.offlineAccess ? 'offline' : 'online'}`;

      const popup = window.open(
        authUrl,
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes',
      );

      if (!popup) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'Failed to open popup window',
          ),
        );
        return;
      }

      // Listen for the popup to close or return with code
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          reject(
            this.createOAuthError(
              OAuthErrorCode.SIGN_IN_CANCELLED,
              'Sign-in popup was closed',
            ),
          );
        }
      }, 1000);

      // Listen for postMessage from popup
      const messageListener = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin) return;

        const data = event.data;
        if (typeof data === 'object' && data !== null && 'type' in data) {
          const typedData = data as {
            type: string;
            code?: string;
            error?: string;
          };
          if (
            typedData.type === 'GOOGLE_OAUTH_SUCCESS' &&
            typeof typedData.code === 'string'
          ) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup.close();
            resolve({
              code: typedData.code,
            });
          } else if (typedData.type === 'GOOGLE_OAUTH_ERROR') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup.close();
            reject(
              this.createOAuthError(
                OAuthErrorCode.UNKNOWN_ERROR,
                typedData.error || 'OAuth failed',
              ),
            );
          }
        }
      };

      window.addEventListener('message', messageListener);
    });
  }

  signOut(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof window !== 'undefined' && window.google?.accounts?.id) {
          window.google.accounts.id.disableAutoSelect();
        }
        resolve();
      } catch (error) {
        // Ignore sign-out errors as they're not critical
        console.warn('Failed to sign out from Google:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  isSignedIn(): Promise<boolean> {
    // For web, we rely on token storage rather than Google's sign-in state
    return Promise.resolve(false);
  }

  getCurrentUser(): Promise<OAuthResponse['user'] | null> {
    // For web, we get user info from the JWT token rather than Google
    return Promise.resolve(null);
  }

  private async loadGoogleIdentityServices(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Window not available');
    }

    // Check if already loaded
    if (window.google?.accounts?.id) {
      return;
    }

    return new Promise((resolve, reject) => {
      // Create script element
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        // Wait a bit for the library to initialize
        setTimeout(() => {
          if (window.google?.accounts?.id) {
            resolve();
          } else {
            reject(new Error('Google Identity Services failed to load'));
          }
        }, 100);
      };

      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services script'));
      };

      // Add to document
      document.head.appendChild(script);
    });
  }

  private createOAuthError(
    code: OAuthErrorCode,
    message: string,
    originalError?: unknown,
  ): OAuthErrorClass {
    return new OAuthErrorClass(code, message, originalError);
  }
}

// Export singleton instance
export const webOAuthProvider = new WebOAuthProvider();
