import { useCallback, useMemo } from 'react';
import memoizeOne from 'memoize-one';
import axios from 'axios';
import {
  googleLogout,
  useGoogleLogin,
  UseGoogleLoginOptionsAuthCodeFlow,
} from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useRouter } from 'expo-router';
import {
  ISecureStorage,
  SecureStorageProvider,
} from '@legacy-sports/shared-components';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
import { AsyncHookResult, useAsyncHook } from '../utilities/HookHelpers';
import { EnvironmentVariable } from '../EnvironmentVariables';

export interface AuthHandlers {
  googleLogin: () => void;
  logout: () => void;
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
    console.error('Error reading secure storage:', error);
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
    console.error('Error storing token:', error);
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
        console.debug(`Key ${key} not found in SecureStorage`);
      }
    }

    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    console.error('Error resetting tokens:', error);
  }
}

function useWebAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
  const router = useRouter();
  const onSuccess = callbacks?.onSuccess;
  const onFailure = callbacks?.onFailure;

  const successHandler = useCallback<
    Required<UseGoogleLoginOptionsAuthCodeFlow>['onSuccess']
  >(
    async (response) => {
      const oauthProxy = getEnvVarRequired(EnvironmentVariable.OAUTH_PROXY);
      const tokenResponse = await axios.post<OAuthProxyTokens>(
        `${oauthProxy}/google/auth`,
        {
          code: response.code,
        },
      );

      await storeToken(tokenResponse.data);

      if (onSuccess) {
        onSuccess();
      }
    },
    [onSuccess],
  );

  const failureHandler = useCallback<
    Required<UseGoogleLoginOptionsAuthCodeFlow>['onError']
  >(
    (err) => {
      if (onFailure) {
        onFailure(err.error_description);
      }
    },
    [onFailure],
  );

  const logout = useCallback(async () => {
    googleLogout();
    // Clear all secrets
    await resetToken();

    router.replace('/');
  }, [router]);

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onError: failureHandler,
    onSuccess: successHandler,
  });

  return useMemo(() => {
    return {
      googleLogin: googleLogin,
      logout: logout,
    };
  }, [googleLogin, logout]);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
}

export function useAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  // Only web auth is implemented in this app-specific version
  // Mobile auth should use the shared-components version
  return useWebAuthHandlers(callbacks);
}

const refreshJwt = memoizeOne(async (keychainLastUpdate: number) => {
  const oauthProxy = getEnvVarRequired(EnvironmentVariable.OAUTH_PROXY);
  const tokenResponse = await axios.post<OAuthProxyTokens>(
    `${oauthProxy}/google/refresh`,
    {},
  );
  await storeToken(tokenResponse.data);
});

const LOCAL_USER: LegacySportsJwt = {
  about: null,
  email: null,
  id: -1,
  isAdmin: false,
  username: 'LOCAL USER',
};

export function useCurrentUserInfo(): AsyncHookResult<LegacySportsJwt | null> {
  const lastUpdateTime = useLastUpdateTime();

  const runHook = useCallback(async () => {
    if (getEnvVarOptional(EnvironmentVariable.BYPASS_AUTH) === 'true') {
      return LOCAL_USER;
    }

    let jwt = await getJwt();

    // JWT Expired, but we can try to refresh
    if (jwt === null) {
      try {
        await refreshJwt(lastUpdateTime);
      } catch (err) {
        // This is okay, we probably don't have one
        LOGGER.info(`Could not refresh jwt: ${err}`);
      }

      jwt = await getJwt();
    }

    return jwt;
  }, [lastUpdateTime]);

  return useAsyncHook(runHook);
}
