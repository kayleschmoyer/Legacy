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
    options?: SecureStorageOptions,
  ): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, value);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
      }
    } catch (error) {
      LOGGER.error(`Error storing secure item ${key}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a value securely from web sessionStorage
   */
  static async getItem(
    key: string,
    options?: SecureStorageOptions,
  ): Promise<string | null> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return sessionStorage.getItem(key);
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
        return null;
      }
    } catch (error) {
      LOGGER.error(`Error retrieving secure item ${key}:`, error);
      return null;
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
    } catch (error) {
      LOGGER.error(`Error removing secure item ${key}:`, error);
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
    } catch (error) {
      LOGGER.error('Error clearing secure storage:', error);
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
