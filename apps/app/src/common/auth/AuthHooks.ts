import { useCallback, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useRouter } from 'expo-router';
import {
  buildGoogleAuthPayload,
  exchangeAppleCode,
  exchangeGoogleCode,
  ISecureStorage,
  OAuthError,
  OAuthProvider,
  OAuthResponse,
  SecureStorageProvider,
} from '@legacy-sports/shared-components';
import type { OAuthErrorCode } from '@legacy-sports/shared-components';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
import { getMobileOAuthConfig } from './mobileOAuthConfig';
import { APPLE_SIGN_IN_CANCELLED, signInWithApple } from './appleAuth';
import { AsyncHookResult, useAsyncHook } from '../utilities/HookHelpers';
import { EnvironmentVariable } from '../EnvironmentVariables';

export interface AuthHandlers {
  googleLogin: () => Promise<void>;
  appleLogin: () => Promise<void>;
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
        LOGGER.error('Authentication success handler error:', String(error));
        if (onFailure) {
          onFailure(
            error instanceof Error ? error.message : 'Authentication failed',
          );
        }
      }
    },
    [onSuccess, onFailure],
  );

  const failureHandler = useCallback(
    (error: OAuthError) => {
      LOGGER.warn('OAuth authentication failed:', error);
      if (onFailure) {
        onFailure(error.message || 'Authentication failed');
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

    router.replace('/');
  }, [router]);

  const googleLogin = useCallback(async () => {
    try {
      await OAuthProvider.configure(getMobileOAuthConfig());
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
        failureHandler(error as OAuthError);
      } else {
        // Create a proper OAuthError
        const oauthError: OAuthError = {
          code: 'UNKNOWN_ERROR' as OAuthErrorCode,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown authentication error',
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
        onFailure(
          error instanceof Error ? error.message : 'Authentication failed',
        );
      }
    }
  }, [onSuccess, onFailure]);

  return useMemo(() => {
    return {
      googleLogin: googleLogin,
      appleLogin: appleLogin,
      logout: logout,
    };
  }, [googleLogin, appleLogin, logout]);
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
      return LOCAL_USER;
    }
    return await getJwt();
  }, [lastUpdateTime]);

  return useAsyncHook(runHook);
}
