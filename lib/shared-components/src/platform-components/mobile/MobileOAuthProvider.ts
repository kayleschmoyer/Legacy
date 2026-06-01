import { LOGGER } from '@legacy-sports/logging';
import {
  GoogleSignin,
  SignInSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  OAuthConfig,
  OAuthError,
  OAuthErrorCode,
  OAuthProvider,
  OAuthResponse,
} from '../types/auth';

// Type definitions for Google Sign-In response
interface GoogleSignInUserInfo {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
}

interface GoogleSignInResponse extends SignInSuccessResponse {
  user: GoogleSignInUserInfo;
  serverAuthCode?: string | null;
}

// Extended GoogleSignin interface with missing methods
interface ExtendedGoogleSignin {
  configure: (config: Record<string, unknown>) => void;
  hasPlayServices: (options?: Record<string, unknown>) => Promise<boolean>;
  signIn: () => Promise<GoogleSignInResponse>;
  signOut: () => Promise<void>;
  isSignedIn: () => Promise<boolean>;
  getCurrentUser: () => GoogleSignInResponse | null;
}

/**
 * Mobile OAuth implementation using react-native-google-signin
 */
export class MobileOAuthProvider implements OAuthProvider {
  private isConfigured = false;
  private config?: OAuthConfig;

  configure(config: OAuthConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!GoogleSignin) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'Google Sign-In library not available',
          ),
        );
        return;
      }

      this.config = config;

      try {
        GoogleSignin.configure({
          webClientId: config.googleClientId,
          offlineAccess: config.offlineAccess ?? true,
          hostedDomain: '', // specify a hashed domain if you want
          forceCodeForRefreshToken: true, // [Android] related to `serverAuthCode`, read the docs link below *.
          accountName: '', // [Android] specifies an account name on the device that should be used
          scopes: [
            'openid',
            'email',
            'profile',
            ...(config.additionalScopes || []),
          ],
          iosClientId: '', // [iOS] if you want to specify the client ID of type iOS (otherwise, it is taken from GoogleService-Info.plist)
        });

        this.isConfigured = true;
        resolve();
      } catch (error) {
        reject(
          this.createOAuthError(
            OAuthErrorCode.CONFIGURATION_ERROR,
            'Failed to configure Google Sign-In',
            error,
          ),
        );
      }
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!GoogleSignin) return false;

    try {
      await GoogleSignin.hasPlayServices();
      return true;
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

    if (!GoogleSignin) {
      throw this.createOAuthError(
        OAuthErrorCode.CONFIGURATION_ERROR,
        'Google Sign-In library not available',
      );
    }

    try {
      // Check if device supports Google Play Services
      await GoogleSignin.hasPlayServices();

      // Sign in
      const googleResponse = await GoogleSignin.signIn();

      if (googleResponse.type !== 'success') {
        throw this.createOAuthError(
          OAuthErrorCode.UNKNOWN_ERROR,
          'Sign-in failed',
        );
      }

      // After the type guard above, googleResponse is SignInSuccessResponse.
      // .data is the User object: { user: {...}, serverAuthCode, idToken, scopes }
      const { user, serverAuthCode } = googleResponse.data;

      // Extract the relevant information
      const response: OAuthResponse = {
        serverAuthCode: serverAuthCode || undefined,
        code: serverAuthCode || undefined,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name || undefined,
              photo: user.photo || undefined,
            }
          : undefined,
      };

      return response;
    } catch (error: unknown) {
      // Handle specific error codes
      const errorObj = error as { code?: string; message?: string };
      if (errorObj.code) {
        switch (errorObj.code) {
          case statusCodes?.SIGN_IN_CANCELLED:
            throw this.createOAuthError(
              OAuthErrorCode.SIGN_IN_CANCELLED,
              'Sign-in was cancelled by user',
              error,
            );
          case statusCodes?.IN_PROGRESS:
            throw this.createOAuthError(
              OAuthErrorCode.IN_PROGRESS,
              'Sign-in already in progress',
              error,
            );
          case statusCodes?.PLAY_SERVICES_NOT_AVAILABLE:
            throw this.createOAuthError(
              OAuthErrorCode.PLAY_SERVICES_NOT_AVAILABLE,
              'Google Play Services not available',
              error,
            );
          default:
            // DEVELOPER_ERROR (Android status code 10) means Google could not
            // match the calling app against a registered Android OAuth client.
            // This is almost always a project-config gap, not a runtime fault:
            // the app's package name + signing-certificate SHA-1 are not
            // registered as an Android OAuth client (client_type 1) in the
            // Google Cloud / Firebase project, or the build was signed with a
            // key whose SHA-1 isn't registered. Surface it explicitly so it
            // isn't swallowed as a generic "Sign-in failed". This version of
            // `statusCodes` doesn't expose DEVELOPER_ERROR, so match the raw
            // code (string name or the native numeric 10) directly.
            if (errorObj.code === 'DEVELOPER_ERROR' || errorObj.code === '10') {
              LOGGER.error(
                'Google Sign-In DEVELOPER_ERROR: the app is not authorized for ' +
                  'Google Sign-In. Verify an Android OAuth client exists for ' +
                  "this app's package name and signing-certificate SHA-1 in the " +
                  'Google Cloud / Firebase project, and that the running build ' +
                  'is signed with that registered key.',
                error instanceof Error ? error : new Error(String(error)),
              );
              throw this.createOAuthError(
                OAuthErrorCode.CONFIGURATION_ERROR,
                'Google Sign-In is not configured for this app ' +
                  '(DEVELOPER_ERROR): the signing certificate SHA-1 / package ' +
                  'name is not registered as an Android OAuth client in the ' +
                  'Google project.',
                error,
              );
            }
            throw this.createOAuthError(
              OAuthErrorCode.UNKNOWN_ERROR,
              errorObj.message || 'Sign-in failed',
              error,
            );
        }
      }

      throw this.createOAuthError(
        OAuthErrorCode.UNKNOWN_ERROR,
        'Sign-in failed',
        error,
      );
    }
  }

  async signOut(): Promise<void> {
    if (!GoogleSignin) {
      return; // Silently ignore if not available
    }

    try {
      await GoogleSignin.signOut();
    } catch (error) {
      // Log but don't throw sign-out errors
      LOGGER.warn('Failed to sign out from Google:', String(error));
    }
  }

  async isSignedIn(): Promise<boolean> {
    if (!GoogleSignin) {
      return false;
    }

    try {
      // Type assertion to access isSignedIn method
      const result = await (
        GoogleSignin as unknown as ExtendedGoogleSignin
      ).isSignedIn();
      return typeof result === 'boolean' ? result : false;
    } catch {
      return false;
    }
  }

  getCurrentUser(): Promise<OAuthResponse['user'] | null> {
    return new Promise((resolve) => {
      if (!GoogleSignin) {
        resolve(null);
        return;
      }

      try {
        const userInfo = (
          GoogleSignin as unknown as ExtendedGoogleSignin
        ).getCurrentUser();
        if (!userInfo?.user) {
          resolve(null);
          return;
        }

        resolve({
          id: userInfo.user.id,
          email: userInfo.user.email,
          name: userInfo.user.name || undefined,
          photo: userInfo.user.photo || undefined,
        });
      } catch {
        resolve(null);
      }
    });
  }

  private createOAuthError(
    code: OAuthErrorCode,
    message: string,
    originalError?: unknown,
  ): Error & OAuthError {
    const error = new Error(message) as Error & OAuthError;
    error.code = code;
    error.message = message;
    error.originalError = originalError;
    return error;
  }
}

// Export singleton instance
export const mobileOAuthProvider = new MobileOAuthProvider();
