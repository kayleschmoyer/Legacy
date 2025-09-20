// Logger setup with fallback
let LOGGER: {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
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
  debug: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.debug(...args);
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

// Dynamic import for Expo SecureStore
let secureStore: typeof import('expo-secure-store') | null = null;

// Initialize Expo SecureStore
const initializeStorage = async () => {
  try {
    if (!secureStore) {
      secureStore = await import('expo-secure-store');
    }
  } catch (error) {
    LOGGER.warn(
      'Expo SecureStore not available, falling back to sessionStorage',
      error instanceof Error ? error.message : String(error),
    );
  }
};

export interface SecureStorageOptions {
  requireAuthentication?: boolean;
}

export class SecureStorage {
  private static initialized = false;

  private static async ensureInitialized() {
    if (!this.initialized) {
      await initializeStorage();
      this.initialized = true;
    }
  }

  /**
   * Store a value securely using Expo SecureStore
   */
  static async setItem(
    key: string,
    value: string,
    options?: SecureStorageOptions,
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      if (secureStore) {
        // Use Expo SecureStore for mobile
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await secureStore.setItemAsync(key, value, {
          requireAuthentication: options?.requireAuthentication || false,
        });
      } else {
        // Fallback to sessionStorage if SecureStore unavailable
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(key, value);
        } else {
          LOGGER.warn('No secure storage available on mobile platform');
        }
      }
    } catch (error) {
      LOGGER.error(`Error storing secure item ${key}:`, error as Error);
      throw error;
    }
  }

  /**
   * Retrieve a value securely from Expo SecureStore
   */
  static async getItem(
    key: string,
    options?: SecureStorageOptions,
  ): Promise<string | null> {
    await this.ensureInitialized();

    try {
      if (secureStore) {
        // Use Expo SecureStore for mobile
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
        return await secureStore.getItemAsync(key, {
          requireAuthentication: options?.requireAuthentication || false,
        });
      } else {
        // Fallback to sessionStorage if SecureStore unavailable
        if (typeof sessionStorage !== 'undefined') {
          return sessionStorage.getItem(key);
        }
        return null;
      }
    } catch (error) {
      LOGGER.error(`Error retrieving secure item ${key}:`, error as Error);
      return null;
    }
  }

  /**
   * Remove a value securely from Expo SecureStore
   */
  static async removeItem(key: string): Promise<void> {
    await this.ensureInitialized();

    try {
      if (secureStore) {
        // Use Expo SecureStore for mobile
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await secureStore.deleteItemAsync(key);
      } else {
        // Fallback to sessionStorage if SecureStore unavailable
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(key);
        }
      }
    } catch (error) {
      LOGGER.error(`Error removing secure item ${key}:`, error as Error);
      throw error;
    }
  }

  /**
   * Clear all stored values from Expo SecureStore
   */
  static async clear(): Promise<void> {
    await this.ensureInitialized();

    try {
      if (secureStore) {
        // SecureStore doesn't have a clear method, so we remove known keys
        const knownKeys = ['GOOGLE_JWT', 'INTERNAL_JWT'];
        for (const key of knownKeys) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await secureStore.deleteItemAsync(key);
          } catch {
            // Ignore errors for keys that don't exist
            LOGGER.debug(`Key ${key} not found in SecureStore`);
          }
        }
      } else {
        // Fallback to sessionStorage if SecureStore unavailable
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
      }
    } catch (error) {
      LOGGER.error('Error clearing secure storage:', error as Error);
      throw error;
    }
  }

  /**
   * Check if a key exists in Expo SecureStore
   */
  static async hasItem(key: string): Promise<boolean> {
    const value = await this.getItem(key);
    return value !== null;
  }
}
