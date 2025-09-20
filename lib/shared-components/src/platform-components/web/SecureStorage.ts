// Logger setup with fallback
let LOGGER: {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
} = {
  // Default fallback implementations
  error: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
  warn: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(...args);
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
    options?: SecureStorageOptions,
  ): Promise<string | null> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Promise.resolve(sessionStorage.getItem(key));
      } else {
        LOGGER.warn('sessionStorage not available on web platform');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Promise.resolve(null);
      }
    } catch (error) {
      LOGGER.error(`Error retrieving secure item ${key}:`, error as Error);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
