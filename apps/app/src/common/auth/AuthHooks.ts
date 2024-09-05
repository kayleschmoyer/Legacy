import { useCallback, useMemo } from 'react';
import memoizeOne from 'memoize-one';
import axios from 'axios';
import {
  googleLogout,
  useGoogleLogin,
  UseGoogleLoginOptionsAuthCodeFlow,
} from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import {
  getGenericPassword,
  resetGenericPassword,
  setGenericPassword,
} from 'react-native-keychain';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { GoogleJwtContents } from '../../login/GoogleJwtContents';
import { AsyncHookResult, useAsyncHook } from '../utilities/HookHelpers';
import { EnvironmentVariable } from '../EnvironmentVariables';

export interface AuthHandlers {
  googleLogin(): void;
  logout(): void;
}

export interface AuthCallbacks {
  onSuccess?: () => void;
  onFailure?: (err: string | undefined) => void;
}

export interface OAuthProxyTokens {
  google_token: string;
  internal_token: string;
}

export interface LegacySportsJwt {
  id: number;
  email: string | null | undefined;
  username: string;
  isAdmin: boolean;
  about: string | null | undefined;
}

export interface CurrentUserInfo {
  googleInfo: GoogleJwtContents;
  internalInfo: LegacySportsJwt;
}

export enum Secret {
  GOOGLE_JWT = 'GOOGLE_JWT',
  INTERNAL_JWT = 'INTERNAL_JWT',
}

let KEYCHAIN_LAST_UPDATE = Date.now().valueOf();

const SECRET_USERNAME = '';

export async function readKeychainValue(
  secret: Secret,
): Promise<string | null> {
  const result = await getGenericPassword({
    service: secret,
  });

  if (result === false) {
    return null;
  }

  return result.password;
}

export async function getJwt(): Promise<CurrentUserInfo | null> {
  let googleJwt;
  let internalJwt;

  switch (Platform.OS) {
    case 'web':
      googleJwt = sessionStorage.getItem(Secret.GOOGLE_JWT);
      internalJwt = sessionStorage.getItem(Secret.INTERNAL_JWT);
      break;
    default:
      googleJwt = await readKeychainValue(Secret.GOOGLE_JWT);
      internalJwt = await readKeychainValue(Secret.INTERNAL_JWT);
      break;
  }

  return googleJwt === null || internalJwt === null
    ? null
    : {
        googleInfo: jwtDecode(googleJwt),
        internalInfo: jwtDecode(internalJwt),
      };
}

async function storeToken(tokens: OAuthProxyTokens): Promise<void> {
  switch (Platform.OS) {
    case 'web':
      sessionStorage.setItem(Secret.GOOGLE_JWT, tokens.google_token);
      sessionStorage.setItem(Secret.INTERNAL_JWT, tokens.internal_token);
      break;
    default:
      await setGenericPassword(SECRET_USERNAME, tokens.google_token, {
        service: Secret.GOOGLE_JWT,
      });
      await setGenericPassword(SECRET_USERNAME, tokens.internal_token, {
        service: Secret.INTERNAL_JWT,
      });
      break;
  }

  // Trigger the react update
  KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
}

async function resetToken(): Promise<void> {
  switch (Platform.OS) {
    case 'web':
      sessionStorage.clear();
      break;
    default:
      await resetGenericPassword({ service: Secret.GOOGLE_JWT });
      await resetGenericPassword({ service: Secret.INTERNAL_JWT });
  }

  // Trigger the react update
  KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
}

function useWebAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const router = useRouter();
  const onSuccess = callbacks?.onSuccess;
  const onFailure = callbacks?.onFailure;

  const successHandler = useCallback<
    Required<UseGoogleLoginOptionsAuthCodeFlow>['onSuccess']
  >(
    async (response) => {
      const oauthProxy = getEnvVarRequired(EnvironmentVariable.OAUTH_PROXY);
      const tokenResponse = await axios.post<OAuthProxyTokens>(
        `${oauthProxy}/auth/google`,
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
  }, []);

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: successHandler,
    onError: failureHandler,
  });

  return useMemo(() => {
    return {
      googleLogin: googleLogin,
      logout: logout,
    };
  }, [googleLogin, logout]);
}

export function useAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  switch (Platform.OS) {
    case 'web':
      return useWebAuthHandlers(callbacks);
    default:
      throw new Error('Auth callbacks not configured for apps');
  }
}

const refreshJwt = memoizeOne(async (keychainLastUpdate: number) => {
  const oauthProxy = getEnvVarRequired(EnvironmentVariable.OAUTH_PROXY);
  const tokenResponse = await axios.post<OAuthProxyTokens>(
    `${oauthProxy}/auth/google/refresh`,
    {},
  );
  storeToken(tokenResponse.data);
});

const LOCAL_USER: CurrentUserInfo = {
  googleInfo: {} as GoogleJwtContents,
  internalInfo: {
    id: -1,
    email: null,
    username: 'LOCAL USER',
    isAdmin: false,
    about: null,
  },
};

export function useCurrentUserInfo(): AsyncHookResult<CurrentUserInfo | null> {
  return useAsyncHook(async () => {
    if (getEnvVarOptional(EnvironmentVariable.BYPASS_AUTH) === 'true') {
      return LOCAL_USER;
    }

    let jwt = await getJwt();

    // JWT Expired, but we can try to refresh
    if (jwt === null) {
      try {
        await refreshJwt(KEYCHAIN_LAST_UPDATE);
      } catch (err) {
        // This is okay, we probably don't have one
        console.log(`Could not refresh jwt: ${err}`);
      }

      jwt = await getJwt();
    }

    return jwt;
  }, [KEYCHAIN_LAST_UPDATE]);
}
