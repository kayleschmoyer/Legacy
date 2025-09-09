import { useCallback, useMemo } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { Platform } from 'react-native';
import { AsyncHookResult, useAsyncHook } from '../../utils/HookHelpers';

// Import dependencies with fallbacks for testing environment
let getEnvVarRequired: any = () => '';
let LOGGER: any = { error: () => {}, warn: () => {}, info: () => {} };

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const envUtilities = require('@legacy-sports/env-utilities');
  getEnvVarRequired = envUtilities.getEnvVarRequired;
} catch (error) {
  // Fallback for test environment
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging');
  LOGGER = logging.LOGGER;
} catch (error) {
  // Fallback for test environment
}

// Import keychain only for native platforms
let keychainModule: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keychainModule = require('react-native-keychain');
  } catch (error) {
    // Keychain not available, will use fallback
  }
}

export interface AuthHandlers {
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

const SECRET_USERNAME = '';

function useLastUpdateTime(): number {
  return KEYCHAIN_LAST_UPDATE;
}

export async function readKeychainValue(
  secret: Secret
): Promise<string | null> {
  if (Platform.OS === 'web' || !keychainModule) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const result = await keychainModule.getGenericPassword({
      service: secret,
    });

    if (result === false) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return result.password;
  } catch (error) {
    LOGGER.error('Error reading keychain', error);
    return null;
  }
}

export async function getJwt(): Promise<LegacySportsJwt | null> {
  let internalJwt: string | null;

  switch (Platform.OS) {
    case 'web':
      try {
        internalJwt =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(Secret.INTERNAL_JWT)
            : null;
      } catch (error) {
        internalJwt = null;
      }
      break;
    default:
      internalJwt = await readKeychainValue(Secret.INTERNAL_JWT);
      break;
  }

  return internalJwt === null ? null : jwtDecode(internalJwt);
}

async function storeToken(tokens: OAuthProxyTokens): Promise<void> {
  switch (Platform.OS) {
    case 'web':
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(Secret.INTERNAL_JWT, tokens.jwt);
        }
      } catch (error) {
        LOGGER.warn('Could not store token in sessionStorage', error);
      }
      break;
    default:
      if (keychainModule) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await keychainModule.setGenericPassword(SECRET_USERNAME, tokens.jwt, {
            service: Secret.INTERNAL_JWT,
          });
        } catch (error) {
          LOGGER.error('Error storing token to keychain', error);
        }
      }
      break;
  }

  // Trigger the react update
  KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
}

async function resetToken(): Promise<void> {
  switch (Platform.OS) {
    case 'web':
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
      } catch (error) {
        LOGGER.warn('Could not clear sessionStorage', error);
      }
      break;
    default:
      if (keychainModule) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await keychainModule.resetGenericPassword({
            service: Secret.GOOGLE_JWT,
          });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await keychainModule.resetGenericPassword({
            service: Secret.INTERNAL_JWT,
          });
        } catch (error) {
          LOGGER.error('Error resetting keychain', error);
        }
      }
  }

  // Trigger the react update
  KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
}

function useWebAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const logout = useCallback(async () => {
    await resetToken();
  }, []);

  return {
    logout,
  };
}

function useNativeAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const logout = useCallback(async () => {
    await resetToken();
  }, []);

  return {
    logout,
  };
}

export function useAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  return Platform.OS === 'web'
    ? useWebAuthHandlers(callbacks)
    : useNativeAuthHandlers(callbacks);
}

export function useCurrentUserInfo(): AsyncHookResult<LegacySportsJwt | null> {
  const lastUpdate = useLastUpdateTime();

  return useAsyncHook(
    useMemo(() => getJwt, [lastUpdate]),
    [lastUpdate]
  );
}
