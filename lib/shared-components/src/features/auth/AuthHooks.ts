import { useCallback, useMemo } from 'react';
import { jwtDecode } from 'jwt-decode';
import { AsyncHookResult, useAsyncHook } from '../../utils/HookHelpers';
import { SecureStorageProvider } from '../../platform-components';
// Type-safe cast for SecureStorageProvider
const secureStorage = SecureStorageProvider;

// Import dependencies with fallbacks for testing environment
let LOGGER: {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
} = {
  // Default fallback implementations (should not be reached in production)
  error: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
  warn: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(...args);
  },
  info: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.info(...args);
  },
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: typeof LOGGER;
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
}

export interface AuthHandlers {
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

function useLastUpdateTime(): number {
  return KEYCHAIN_LAST_UPDATE;
}

export async function readSecureValue(secret: Secret): Promise<string | null> {
  try {
    return await secureStorage.getItem(secret);
  } catch (error) {
    LOGGER.error('Error reading secure storage', error);
    return null;
  }
}

export async function getJwt(): Promise<LegacySportsJwt | null> {
  try {
    const internalJwt = await secureStorage.getItem(Secret.INTERNAL_JWT);
    return internalJwt === null ? null : jwtDecode(internalJwt);
  } catch (error) {
    LOGGER.error('Error getting JWT from secure storage', error);
    return null;
  }
}

async function resetToken(): Promise<void> {
  try {
    await secureStorage.clear();
    // Trigger the react update
    KEYCHAIN_LAST_UPDATE = Date.now().valueOf();
  } catch (error) {
    LOGGER.error('Error clearing secure storage', error);
  }
}

function useAuthHandlers(callbacks?: AuthCallbacks): AuthHandlers {
  const logout = useCallback(async () => {
    await resetToken();
  }, []);

  return {
    logout,
  };
}

export { useAuthHandlers };

export function useCurrentUserInfo(): AsyncHookResult<LegacySportsJwt | null> {
  const lastUpdate = useLastUpdateTime();

  return useAsyncHook(
    useMemo(() => getJwt, []),
    [lastUpdate],
  );
}
