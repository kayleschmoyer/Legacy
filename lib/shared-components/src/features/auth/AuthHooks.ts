import { useCallback, useMemo } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { AsyncHookResult, useAsyncHook } from '../../utils/HookHelpers';
import { SecureStorage } from '../../platform-components';

// Import dependencies with fallbacks for testing environment
let getEnvVarRequired: any = () => '';
let LOGGER: any = { error: () => {}, warn: () => {}, info: () => {} };

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const envUtilities = require('@legacy-sports/env-utilities');
  getEnvVarRequired = envUtilities.getEnvVarRequired;
} catch {
  // Fallback for test environment
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const logging = require('@legacy-sports/logging');
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
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

function useLastUpdateTime(): number {
  return KEYCHAIN_LAST_UPDATE;
}

export async function readSecureValue(secret: Secret): Promise<string | null> {
  try {
    return await SecureStorage.getItem(secret);
  } catch (error) {
    LOGGER.error('Error reading secure storage', error);
    return null;
  }
}

export async function getJwt(): Promise<LegacySportsJwt | null> {
  try {
    const internalJwt = await SecureStorage.getItem(Secret.INTERNAL_JWT);
    return internalJwt === null ? null : jwtDecode(internalJwt);
  } catch (error) {
    LOGGER.error('Error getting JWT from secure storage', error);
    return null;
  }
}

async function storeToken(tokens: OAuthProxyTokens): Promise<void> {
  try {
    await SecureStorage.setItem(Secret.INTERNAL_JWT, tokens.jwt);
    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    LOGGER.error('Error storing token to secure storage', error);
  }
}

async function resetToken(): Promise<void> {
  try {
    await SecureStorage.clear();
    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    LOGGER.error('Error clearing secure storage', error);
  }
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
