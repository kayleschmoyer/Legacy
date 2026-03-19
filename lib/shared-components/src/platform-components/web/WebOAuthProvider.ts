import { LOGGER } from '@legacy-sports/logging';
import {
  OAuthConfig,
  OAuthErrorCode,
  OAuthProvider,
  OAuthResponse,
} from '../types/auth';

// Google Identity Services global types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: ExtendedGoogleIdConfiguration) => void;
          prompt: (
            momentListener?: (notification: PromptMomentNotification) => void,
          ) => void;
          cancel: () => void;
          renderButton: (
            parent: HTMLElement,
            options: GsiButtonConfiguration,
          ) => void;
        };
        oauth2: {
          initCodeClient: (config: CodeClientConfig) => CodeClient;
        };
      };
    };
  }
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (credentialResponse: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

// Extended configuration that includes newer GSI features
interface ExtendedGoogleIdConfiguration extends GoogleIdConfiguration {
  use_fedcm_for_prompt?: boolean;
}

interface CredentialResponse {
  credential: string;
  select_by?: string;
}

interface PromptMomentNotification {
  getMomentType: () => string;
  getDismissedReason?: () => string;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode?: 'popup' | 'redirect';
  callback: (response: CodeResponse) => void;
  error_callback?: (error: CodeError) => void;
}

interface CodeResponse {
  code: string;
  error?: string;
  error_description?: string;
}

interface CodeError {
  error: string;
  error_description?: string;
}

interface CodeClient {
  requestCode: () => void;
}

interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string | number;
  locale?: string;
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

/**
 * Web OAuth implementation using Google Identity Services (GSI)
 *
 * Features:
 * - One Tap sign-in enabled by default for seamless UX
 * - Authorization code flow for secure backend authentication
 * - Auto-loading of GSI library
 * - Clean, modern authentication without popup blockers
 */
export class WebOAuthProvider implements OAuthProvider {
  private isConfigured = false;
  private config?: OAuthConfig;
  private gsiLoaded = false;
  private codeClient?: CodeClient;
  private oneTapInitialized = false;
  private fedcmFailed = false;

  async configure(config: OAuthConfig): Promise<void> {
    this.config = config;

    // Load GSI library if not already loaded
    if (typeof window !== 'undefined' && !this.gsiLoaded) {
      await this.loadGSILibrary();
    }

    this.isConfigured = true;

    // Initialize One Tap immediately if enabled (for page load experience)
    // Also re-initialize if a previous FedCM attempt failed and we need to retry
    if (this.shouldEnableOneTap() && !this.oneTapInitialized) {
      // Add small delay to ensure DOM is ready and GSI is fully loaded
      setTimeout(() => {
        this.initializeOneTap();
      }, 100);
    }
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(
      typeof window !== 'undefined' &&
        this.gsiLoaded &&
        !!window.google?.accounts,
    );
  }

  async signIn(): Promise<OAuthResponse> {
    if (!this.isConfigured || !this.config) {
      throw this.createOAuthError(
        OAuthErrorCode.CONFIGURATION_ERROR,
        'OAuth provider not configured',
      );
    }

    if (!(await this.isAvailable())) {
      throw this.createOAuthError(
        OAuthErrorCode.CONFIGURATION_ERROR,
        'Google Identity Services not available',
      );
    }

    // Use authorization code flow for secure authentication
    // Note: One Tap is already initialized on page load in configure()
    return this.signInWithAuthCode();
  }

  private async loadGSILibrary(): Promise<void> {
    if (window.google?.accounts) {
      this.gsiLoaded = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.gsiLoaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.head.appendChild(script);
    });
  }

  private shouldEnableOneTap(): boolean {
    // Enable One Tap by default, unless explicitly disabled
    // We'll handle FedCM errors gracefully rather than completely disabling
    return this.config?.gsi?.oneTap !== false;
  }

  private initializeOneTap(useFedCm?: boolean): void {
    if (!window.google?.accounts?.id || !this.config) {
      return;
    }

    if (!this.shouldEnableOneTap()) {
      return;
    }

    // Determine whether to use FedCM: explicit parameter > previous failure > default
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const enableFedCm =
      useFedCm !== undefined ? useFedCm : !isLocalhost && !this.fedcmFailed;

    try {
      const gsiConfig: ExtendedGoogleIdConfiguration = {
        client_id: this.config.googleClientId,
        use_fedcm_for_prompt: enableFedCm,
        callback: (response: CredentialResponse) => {
          // One Tap provides ID token - send it directly to OAuth proxy
          void this.handleOneTapResponse(response)
            .then((authResponse) => {
              // Emit success event for auth system
              window.dispatchEvent(
                new CustomEvent('gsi-one-tap-success', {
                  detail: { authResponse },
                }),
              );
            })
            .catch((error: unknown) => {
              LOGGER.error('One Tap authentication failed:', String(error));
              window.dispatchEvent(
                new CustomEvent('gsi-one-tap-error', {
                  detail: { error },
                }),
              );
            });
        },
        auto_select: this.config.gsi?.autoSelect ?? true,
        cancel_on_tap_outside: this.config.gsi?.cancelOnTapOutside ?? true,
      };

      window.google.accounts.id.initialize(gsiConfig);

      // Show One Tap prompt
      window.google.accounts.id.prompt(
        (notification: PromptMomentNotification) => {
          const momentType = notification.getMomentType();
          const dismissedReason = notification.getDismissedReason?.();
          const skippedReason = notification.getSkippedReason?.();
          const notDisplayedReason = notification.getNotDisplayedReason?.();

          if (momentType === 'dismissed' && dismissedReason) {
            LOGGER.warn('One Tap dismissed:', dismissedReason);

            // Retry without FedCM when dismissed due to FedCM-specific failures.
            // Exclude 'credential_returned' — it means the credential callback
            // already fired (successful selection), so retrying would cause a
            // redundant second prompt / duplicate login flow.
            if (
              enableFedCm &&
              !this.fedcmFailed &&
              dismissedReason !== 'credential_returned' &&
              (dismissedReason === 'cancel_called' ||
                // Any other unexpected dismiss during FedCM warrants a retry
                dismissedReason !== 'user_cancel')
            ) {
              LOGGER.warn(
                'FedCM dismissed One Tap, retrying without FedCM:',
                dismissedReason,
              );
              this.fedcmFailed = true;
              this.oneTapInitialized = false;
              this.initializeOneTap(false);
              return;
            }
          }

          if (momentType === 'skipped' && skippedReason) {
            LOGGER.warn('One Tap skipped:', skippedReason);
          }

          if (notDisplayedReason) {
            LOGGER.warn('One Tap not displayed:', notDisplayedReason);
          }
        },
      );

      this.oneTapInitialized = true;
    } catch (error) {
      LOGGER.error('Failed to initialize One Tap:', String(error));
      // Don't throw - fall back to authorization code flow
    }
  }

  private async signInWithAuthCode(): Promise<OAuthResponse> {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2 || !this.config) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'GSI OAuth2 not available',
          ),
        );
        return;
      }

      try {
        // Initialize the code client for authorization code flow
        this.codeClient = window.google.accounts.oauth2.initCodeClient({
          client_id: this.config.googleClientId,
          scope: [
            'openid',
            'email',
            'profile',
            ...(this.config.additionalScopes || []),
          ].join(' '),
          ux_mode: this.config.gsi?.uxMode || 'popup',
          callback: (response: CodeResponse) => {
            if (response.error) {
              reject(
                this.createOAuthError(
                  OAuthErrorCode.UNKNOWN_ERROR,
                  response.error_description || response.error,
                ),
              );
              return;
            }

            if (response.code) {
              resolve({
                code: response.code,
              });
            } else {
              reject(
                this.createOAuthError(
                  OAuthErrorCode.UNKNOWN_ERROR,
                  'No authorization code received',
                ),
              );
            }
          },
          error_callback: (error: CodeError) => {
            reject(
              this.createOAuthError(
                OAuthErrorCode.UNKNOWN_ERROR,
                error.error_description || error.error,
              ),
            );
          },
        });

        // Request the authorization code
        this.codeClient.requestCode();
      } catch (error) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'Failed to initialize GSI code client',
            error,
          ),
        );
      }
    });
  }

  private async handleOneTapResponse(
    response: CredentialResponse,
  ): Promise<OAuthResponse> {
    // One Tap provides an ID token (credential) - send it directly to OAuth proxy
    // The OAuth proxy handles this via the credential field
    const result = {
      credential: response.credential,
      user: {
        id: 'one-tap-user', // Will be populated by backend from ID token
        email: undefined, // Will be populated by backend from ID token
        name: undefined, // Will be populated by backend from ID token
      },
    };
    return await Promise.resolve(result);
  }

  signOut(): Promise<void> {
    // Cancel One Tap if active
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.cancel();
      } catch (error) {
        LOGGER.warn('Error canceling One Tap:', String(error));
      }
    }
    return Promise.resolve();
  }

  isSignedIn(): Promise<boolean> {
    // For web, we rely on token storage rather than Google's sign-in state
    return Promise.resolve(false);
  }

  getCurrentUser(): Promise<OAuthResponse['user'] | null> {
    // For web, we get user info from the JWT token rather than Google
    return Promise.resolve(null);
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
