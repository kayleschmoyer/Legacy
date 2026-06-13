import { useCallback, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useRouter } from 'expo-router';
import {
  buildGoogleAuthPayload,
  exchangeAppleCode,
  exchangeDiscordCode,
  exchangeGoogleCode,
  ISecureStorage,
  OAuthError,
  OAuthErrorCode,
  OAuthProvider,
  OAuthResponse,
  SecureStorageProvider,
} from '@legacy-sports/shared-components';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';
import { getMobileOAuthConfig } from './mobileOAuthConfig';
import { APPLE_SIGN_IN_CANCELLED, signInWithApple } from './appleAuth';
import { DISCORD_SIGN_IN_CANCELLED, signInWithDiscord } from './discordAuth';
import { AsyncHookResult, useAsyncHook } from '../utilities/HookHelpers';
import { EnvironmentVariable } from '../EnvironmentVariables';
import { clearApolloCache } from '../ApolloClientContext';
import { trackGoogleSignInFailure } from '../../utils/analytics';

declare const __DEV__: boolean;

export interface AuthHandlers {
  googleLogin: () => Promise<void>;
  appleLogin: () => Promise<void>;
  discordLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

export interface AuthCallbacks {
  onSuccess?: () => void;
  onFailure?: (err: string | undefined) => void;
}

export interface OAuthProxyTokens {
  jwt: string;
}

export interface LegacySportsJwt {
  id: number;
  email: string | null | undefined;
  username: string;
  isAdmin: boolean;
  about: string | null | undefined;
}

export enum Secret {
  GOOGLE_JWT = 'GOOGLE_JWT',
  INTERNAL_JWT = 'INTERNAL_JWT',
}

type AuthStateSubscriber = () => void;
const authStateSubscribers = new Set<AuthStateSubscriber>();

function notifyAuthStateSubscribers(): void {
  for (const subscriber of authStateSubscribers) {
    subscriber();
  }
}

// Use platform-specific secure storage from platform-components
const secureStorage: ISecureStorage = SecureStorageProvider;

function useLastUpdateTime(): number {
  const [updateTime, setUpdateTime] = useState(Date.now);

  useEffect(() => {
    const notify = (): void => setUpdateTime(Date.now());
    authStateSubscribers.add(notify);
    return () => {
      authStateSubscribers.delete(notify);
    };
  }, []);

  return updateTime;
}

export async function readKeychainValue(
  secret: Secret,
): Promise<string | null> {
  try {
    return await secureStorage.getItem(secret);
  } catch (error) {
    LOGGER.error('Error reading secure storage:', String(error));
    return null;
  }
}

export async function getJwt(): Promise<LegacySportsJwt | null> {
  const internalJwt = await readKeychainValue(Secret.INTERNAL_JWT);
  return internalJwt === null ? null : jwtDecode(internalJwt);
}

async function storeToken(tokens: OAuthProxyTokens): Promise<void> {
  try {
    await secureStorage.setItem(Secret.INTERNAL_JWT, tokens.jwt);
    // Notify all subscribed hooks so they re-fetch the auth state
    notifyAuthStateSubscribers();
  } catch (error) {
    LOGGER.error(
      'Error storing token:',
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

async function resetToken(): Promise<void> {
  try {
    // Clear all secrets using platform-agnostic secure storage
    const keysToDelete = [Secret.GOOGLE_JWT, Secret.INTERNAL_JWT];
    for (const key of keysToDelete) {
      try {
        await secureStorage.removeItem(key);
      } catch {
        // Ignore errors for keys that don't exist
        LOGGER.debug(`Key ${key} not found in SecureStorage`);
      }
    }

    // Notify all subscribed hooks so they re-fetch the auth state
    notifyAuthStateSubscribers();
  } catch (error) {
    LOGGER.error(
      'Error resetting tokens:',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

// Surfaced to the UI for unexpected (non-OAuthError) sign-in failures. An
// arbitrary error here — from a third-party library, the network stack, or the
// OAuth proxy — can carry internal details (paths, stack traces) in its
// `message`, so we never forward raw `error.message` to the client. The full
// error is always logged internally via LOGGER before this is shown (LS-6657).
const GENERIC_AUTH_ERROR = 'Authentication failed. Please try again.';

function usePlatformAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const router = useRouter();
  const onSuccess = callbacks?.onSuccess;
  const onFailure = callbacks?.onFailure;

  const successHandler = useCallback(
    async (response: OAuthResponse) => {
      try {
        const { oauthProxyUrl } = getMobileOAuthConfig();
        if (!oauthProxyUrl) {
          throw new Error('OAuth proxy URL is not configured');
        }

        // Payload assembly (incl. the serverAuthCode/redirect_uri
        // disambiguation) and transport now live in the shared
        // `googleAuthExchange` helpers so web and mobile can never drift again
        // (the root cause of LS-5082 and LS-5084). Only the mobile-specific
        // token storage (secure storage) stays here.
        const authPayload = buildGoogleAuthPayload(response);
        const result = await exchangeGoogleCode(oauthProxyUrl, authPayload);

        await storeToken({ jwt: result.jwt });

        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        // Log full detail internally, surface only a generic message to the UI.
        LOGGER.error('Authentication success handler error:', String(error));
        if (onFailure) {
          onFailure(GENERIC_AUTH_ERROR);
        }
      }
    },
    [onSuccess, onFailure],
  );

  const failureHandler = useCallback(
    (error: OAuthError) => {
      LOGGER.warn('OAuth authentication failed:', error);
      if (onFailure) {
        // OAuthError messages are structured, provider-supplied, user-facing
        // strings (e.g. "User cancelled the sign-in flow"), so they are safe to
        // surface directly. Unexpected (non-OAuthError) failures are mapped to
        // GENERIC_AUTH_ERROR before reaching here (see googleLogin) (LS-6657).
        onFailure(error.message || GENERIC_AUTH_ERROR);
      }
    },
    [onFailure],
  );

  const logout = useCallback(async () => {
    try {
      // Use platform-specific OAuth provider to sign out
      await OAuthProvider.signOut();
    } catch (error) {
      LOGGER.warn('Error during OAuth sign-out:', String(error));
      // Continue with local logout even if OAuth sign-out fails
    }

    // Clear all secrets
    await resetToken();

    // Clear the Apollo cache so stale data from this user doesn't appear
    // after a subsequent login (e.g., notification badge count)
    try {
      await clearApolloCache();
    } catch (error) {
      LOGGER.warn('Error clearing Apollo cache on logout:', String(error));
    }

    router.replace('/');
  }, [router]);

  const googleLogin = useCallback(async () => {
    const oauthConfig = getMobileOAuthConfig();
    const { oauthProxyUrl } = oauthConfig;

    // Reject missing or whitespace-only proxy URL before starting the Google
    // sign-in flow — mirrors the identical guard in appleLogin/discordLogin.
    // In production builds a localhost URL is unreachable from a real device
    // and causes the OAuth callback to silently loop back to login (MOB-019).
    const isLocalhostInProd =
      !__DEV__ &&
      !!oauthProxyUrl &&
      /^https?:\/\/localhost/i.test(oauthProxyUrl);
    if (!oauthProxyUrl?.trim() || isLocalhostInProd) {
      const configError: OAuthError = {
        code: 'CONFIGURATION_ERROR' as OAuthErrorCode,
        message:
          'Google Sign-In is not configured for this build (missing OAUTH_PROXY).',
      };
      trackGoogleSignInFailure(configError.code);
      failureHandler(configError);
      return;
    }

    try {
      await OAuthProvider.configure(oauthConfig);
      const response = await OAuthProvider.signIn();
      await successHandler(response);
    } catch (error) {
      // Check if it's already an OAuthError
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        const oauthError = error as OAuthError;
        // DEVELOPER_ERROR means the app's signing cert SHA-1 / package name is
        // not registered in the Google Cloud project. Capture to Rollbar with
        // build-config context so it's searchable by the config-issues label.
        if (oauthError.code === OAuthErrorCode.DEVELOPER_ERROR) {
          const errorToCapture =
            oauthError.originalError instanceof Error
              ? oauthError.originalError
              : new Error(
                  `Google Sign-In DEVELOPER_ERROR: build config mismatch. Original message: ${oauthError.message}`,
                  { cause: oauthError.originalError as Error },
                );
          captureError(errorToCapture, { 'build-config-issue': true });
        }
        trackGoogleSignInFailure(String(oauthError.code));
        failureHandler(oauthError);
      } else {
        // Unexpected, non-OAuthError failure: surface a generic message to the
        // UI while preserving the original error on `originalError` (logged by
        // failureHandler) so no detail is lost internally (LS-6657).
        trackGoogleSignInFailure('UNKNOWN_ERROR');
        const oauthError: OAuthError = {
          code: 'UNKNOWN_ERROR' as OAuthErrorCode,
          message: GENERIC_AUTH_ERROR,
          originalError: error,
        };
        failureHandler(oauthError);
      }
    }
  }, [successHandler, failureHandler]);

  const appleLogin = useCallback(async () => {
    try {
      const { oauthProxyUrl } = getMobileOAuthConfig();
      if (!oauthProxyUrl) {
        throw new Error('OAuth proxy URL is not configured');
      }

      // Native Sign in with Apple (AuthenticationServices) returns an
      // Apple-signed identity token; the oauth-proxy `/apple` endpoint verifies
      // it and exchanges it for a Legacy Sports JWT, mirroring the Google flow.
      const payload = await signInWithApple();
      const result = await exchangeAppleCode(oauthProxyUrl, payload);

      await storeToken({ jwt: result.jwt });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // A user dismissing the native sheet is not a failure to surface.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === APPLE_SIGN_IN_CANCELLED
      ) {
        LOGGER.debug('Apple sign-in cancelled by user');
        if (onFailure) {
          onFailure(undefined);
        }
        return;
      }

      LOGGER.error(
        'Apple authentication error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      if (onFailure) {
        // Generic UI message; the full error is logged above (LS-6657).
        onFailure(GENERIC_AUTH_ERROR);
      }
    }
  }, [onSuccess, onFailure]);

  const discordLogin = useCallback(async () => {
    try {
      const { oauthProxyUrl, discordClientId } = getMobileOAuthConfig();
      // Reject blank/whitespace-only config as well as undefined — a present-but-
      // empty env var would otherwise pass a bare truthiness check and start the
      // flow with an invalid value.
      if (!oauthProxyUrl?.trim()) {
        throw new Error('OAuth proxy URL is not configured');
      }
      if (!discordClientId?.trim()) {
        throw new Error('Discord client ID is not configured');
      }

      // Open the system browser, run the PKCE authorization, and exchange the
      // returned code with the oauth-proxy native path. Mirrors the Apple flow:
      // the shared `exchangeDiscordCode` helper is the single transport so web
      // and mobile cannot drift.
      const { code, codeVerifier, redirectUri } =
        await signInWithDiscord(discordClientId);
      const result = await exchangeDiscordCode(oauthProxyUrl, {
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });

      await storeToken({ jwt: result.jwt });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // A user dismissing the in-app browser is not a failure to surface.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === DISCORD_SIGN_IN_CANCELLED
      ) {
        LOGGER.debug('Discord sign-in cancelled by user');
        if (onFailure) {
          onFailure(undefined);
        }
        return;
      }

      LOGGER.error(
        'Discord authentication error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      if (onFailure) {
        // Generic UI message; the full error is logged above (LS-6657).
        onFailure(GENERIC_AUTH_ERROR);
      }
    }
  }, [onSuccess, onFailure]);

  return useMemo(() => {
    return {
      googleLogin: googleLogin,
      appleLogin: appleLogin,
      discordLogin: discordLogin,
      logout: logout,
    };
  }, [googleLogin, appleLogin, discordLogin, logout]);
}

export function useAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  // Uses platform abstraction layer - works on both web and mobile
  return usePlatformAuthHandlers(callbacks);
}

const LOCAL_USER: LegacySportsJwt = {
  about: null,
  email: null,
  id: -1,
  isAdmin: false,
  username: 'LOCAL USER',
};

export function useCurrentUserInfo(): AsyncHookResult<LegacySportsJwt | null> {
  // Re-run the hook when stored secrets change (login/logout) so the cached
  // JWT picks up the new value. The bump value is captured inside the
  // callback purely so the dependency is real and not a lint-disable.
  const lastUpdateTime = useLastUpdateTime();

  const runHook = useCallback(async () => {
    void lastUpdateTime;
    if (getEnvVarOptional(EnvironmentVariable.BYPASS_AUTH) === 'true') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'BYPASS_AUTH is set in a production build — remove EXPO_PUBLIC_BYPASS_AUTH from your production environment.',
        );
      }
      LOGGER.warn(
        'BYPASS_AUTH is active — returning fake LOCAL_USER (id: -1). Remove EXPO_PUBLIC_BYPASS_AUTH before shipping to production.',
      );
      return LOCAL_USER;
    }
    return await getJwt();
  }, [lastUpdateTime]);

  return useAsyncHook(runHook);
}
