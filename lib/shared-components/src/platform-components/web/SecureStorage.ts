import { LOGGER } from '@legacy-sports/logging';

export interface SecureStorageOptions {
  requireAuthentication?: boolean;
}

export class SecureStorage {
  /**
   * Store a value securely using web sessionStorage
   */
  static async setItem(
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
      throw error;
    }
  }

  /**
   * Retrieve a value securely from web sessionStorage
   */
  static async getItem(
    key: string,
    _options?: SecureStorageOptions,
  ): Promise<string | null> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return Promise.resolve(sessionStorage.getItem(key));
      } else {
        LOGGER.warn('sessionStorage not available on web platform');

        return Promise.resolve(null);
      }
    } catch (error) {
      LOGGER.error(`Error retrieving secure item ${key}:`, error as Error);

      return Promise.resolve(null);
    }
  }

  /**
   * Remove a value securely from web sessionStorage
   */
  static async removeItem(key: string): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(key);
      }
      return Promise.resolve();
    } catch (error) {
      LOGGER.error(`Error removing secure item ${key}:`, error as Error);
      throw error;
    }
  }

  /**
   * Clear all stored values from web sessionStorage
   */
  static async clear(): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      return Promise.resolve();
    } catch (error) {
      LOGGER.error('Error clearing secure storage:', error as Error);
      throw error;
    }
  }

  /**
   * Check if a key exists in web sessionStorage
   */
  static async hasItem(key: string): Promise<boolean> {
    const value = await this.getItem(key);
    return value !== null;
  }
}
