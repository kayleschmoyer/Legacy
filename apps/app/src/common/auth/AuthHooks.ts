import { useCallback, useMemo } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { useRouter } from 'expo-router';
import {
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
import { AsyncHookResult, useAsyncHook } from '../utilities/HookHelpers';
import { EnvironmentVariable } from '../EnvironmentVariables';

export interface AuthHandlers {
  googleLogin: () => Promise<void>;
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

let KEYCHAIN_LAST_UPDATE = Date.now().valueOf();

// Use platform-specific secure storage from platform-components
const secureStorage: ISecureStorage = SecureStorageProvider;

function useLastUpdateTime(): number {
  return KEYCHAIN_LAST_UPDATE;
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
    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    LOGGER.error('Error storing token:', String(error));
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

    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    LOGGER.error('Error resetting tokens:', String(error));
  }
}

function usePlatformAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const router = useRouter();
  const onSuccess = callbacks?.onSuccess;
  const onFailure = callbacks?.onFailure;

  const successHandler = useCallback(
    async (response: OAuthResponse) => {
      try {
        const oauthProxy = getMobileOAuthConfig().oauthProxyUrl;

        // Handle both web (code/credential) and mobile (serverAuthCode) responses
        const authPayload: {
          code?: string;
          credential?: string;
          redirect_uri?: string;
        } = {};

        if (response.serverAuthCode) {
          // Native Google Sign-In serverAuthCode. Google mints it without a
          // redirect_uri, so the proxy must exchange it with an empty
          // redirect_uri — omitting it would default to 'postmessage' (the web
          // GSI value) and Google would reject the exchange with invalid_grant,
          // leaving the user with no JWT and bouncing them back to login.
          // (MobileOAuthProvider always populates serverAuthCode for the native
          // flow, so this branch is what the Android/iOS app actually hits.)
          authPayload.code = response.serverAuthCode;
          authPayload.redirect_uri = '';
        } else if (response.code) {
          // Bare authorization code without a native serverAuthCode. Leave
          // redirect_uri unset so the proxy applies its default ('postmessage')
          // instead of being forced down the native (empty redirect_uri) path.
          authPayload.code = response.code;
        } else if (response.credential) {
          // Web ID token from One Tap
          authPayload.credential = response.credential;
        } else {
          throw new Error(
            'No valid authentication code or credential received',
          );
        }

        // Posts to the secure Google flow (`/oauth/google` once the `/oauth`
        // base segment is applied) — the same endpoint the web client uses.
        // The proxy router has no `/google/auth` route, so the old suffix 404'd
        // and the user was bounced back to login without a JWT.
        const tokenResponse = await axios.post<OAuthProxyTokens>(
          `${oauthProxy}/google`,
          authPayload,
        );

        await storeToken(tokenResponse.data);

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

  return useMemo(() => {
    return {
      googleLogin: googleLogin,
      logout: logout,
    };
  }, [googleLogin, logout]);
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
      return LOCAL_USER;
    }
    return await getJwt();
  }, [lastUpdateTime]);

  return useAsyncHook(runHook);
}
