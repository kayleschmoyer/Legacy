import { LOGGER } from '@legacy-sports/logging';

/**
 * Web SecureStorage implementation
 * Uses sessionStorage for secure data storage on web platforms
 */

export interface SecureStorageOptions {
  requireAuthentication?: boolean;
}

/**
 * SecureStorage interface for consistent API across platforms
 */
export interface ISecureStorage {
  setItem(
    key: string,
    value: string,
    options?: SecureStorageOptions,
  ): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  hasItem(key: string): Promise<boolean>;
}

export class SecureStorage implements ISecureStorage {
  /**
   * Store a value securely using web sessionStorage
   */
  setItem(
    key: string,
    value: string,
    _options?: SecureStorageOptions,
  ): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, value);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
      return Promise.resolve();
    } catch (error) {
      LOGGER.error(`Error storing secure item ${key}:`, error as Error);
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Retrieve a value securely from web sessionStorage
   */
  getItem(key: string): Promise<string | null> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return Promise.resolve(sessionStorage.getItem(key));
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
        return Promise.resolve(null);
      }
    } catch (error) {
      LOGGER.error(`Error retrieving secure item ${key}:`, error as Error);
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Remove a value securely from web sessionStorage
   */
  removeItem(key: string): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(key);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
      return Promise.resolve();
    } catch (error) {
      LOGGER.error(`Error removing secure item ${key}:`, error as Error);
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Clear all values from web sessionStorage
   */
  clear(): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
      return Promise.resolve();
    } catch (error) {
      LOGGER.error('Error clearing secure storage:', error as Error);
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Check if a key exists in web sessionStorage
   */
  hasItem(key: string): Promise<boolean> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return Promise.resolve(sessionStorage.getItem(key) !== null);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
        return Promise.resolve(false);
      }
    } catch (error) {
      LOGGER.error(`Error checking secure item ${key}:`, error as Error);
      return Promise.resolve(false);
    }
  }
}

// Export singleton instance for direct use
export const secureStorage = new SecureStorage();

// Export as default for easy importing
export default secureStorage;
