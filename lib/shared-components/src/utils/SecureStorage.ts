import { LOGGER } from '@legacy-sports/logging';

import type { ISecureStorage } from '../platform-components/types/auth';

/**
 * Web SecureStorage — uses sessionStorage.
 *
 * Paired with `SecureStorage.native.ts` via Metro's `.native.ts`
 * resolution. Both files implement `ISecureStorage` exactly; see
 * `platform-components/types/auth.ts` for the canonical contract.
 */
export class SecureStorage implements ISecureStorage {
  setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, value);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
    } catch (error) {
      LOGGER.warn(`Failed to store item ${key}:`, error as Error);
    }
    return Promise.resolve();
  }

  getItem(key: string): Promise<string | null> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return Promise.resolve(sessionStorage.getItem(key));
      }
      LOGGER.warn('sessionStorage not available on web platform');
      return Promise.resolve(null);
    } catch (error) {
      LOGGER.warn(`Failed to retrieve item ${key}:`, error as Error);
      return Promise.resolve(null);
    }
  }

  removeItem(key: string): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(key);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
    } catch (error) {
      LOGGER.warn(`Failed to remove item ${key}:`, error as Error);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
    } catch (error) {
      LOGGER.warn('Failed to clear secure storage:', error as Error);
    }
    return Promise.resolve();
  }

  hasItem(key: string): Promise<boolean> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return Promise.resolve(sessionStorage.getItem(key) !== null);
      }
      LOGGER.warn('sessionStorage not available on web platform');
      return Promise.resolve(false);
    } catch (error) {
      LOGGER.warn(`Failed to check secure item ${key}:`, error as Error);
      return Promise.resolve(false);
    }
  }
}

export const secureStorage = new SecureStorage();

/**
 * Reset secure storage for tests. On web this clears sessionStorage.
 * Exposed as `__` so it is obviously test-only at call sites.
 */
export const __resetForTesting = (): void => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
};

export type { ISecureStorage } from '../platform-components/types/auth';

export default secureStorage;
