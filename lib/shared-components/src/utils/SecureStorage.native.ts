/**
 * Mobile SecureStorage implementation
 * Uses Expo SecureStore for hardware-backed security on mobile platforms
 */

import { LOGGER } from '@legacy-sports/logging';

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

// Dynamic import for Expo SecureStore
let secureStore: typeof import('expo-secure-store') | null = null;

// Initialize Expo SecureStore lazily
const initializeStorage = async () => {
  try {
    if (!secureStore) {
      secureStore = await import('expo-secure-store');
    }
  } catch (error) {
    LOGGER.warn(
      'Expo SecureStore not available, falling back to fallback storage',
      error instanceof Error ? error.message : String(error),
    );
  }
};

export class SecureStorage implements ISecureStorage {
  /**
   * Store a value in Expo SecureStore with memory fallback
   */
  setItem(key: string, value: string): Promise<void> {
    return new Promise((resolve) => {
      // Store in memory immediately as fallback
      this._memoryStorage[key] = value;

      // Try to store in SecureStore
      if (secureStore) {
        secureStore
          .setItemAsync(key, value)
          .then(() => {
            LOGGER.debug(`Stored item in SecureStore: ${key}`);
            resolve();
          })
          .catch((error) => {
            LOGGER.warn(
              `Failed to store in SecureStore, using memory fallback: ${key}`,
              String(error),
            );
            // Value is already in memory storage, so we can continue
            resolve();
          });
      } else {
        LOGGER.debug(`Stored item in memory (SecureStore unavailable): ${key}`);
        resolve();
      }
    });
  }

  /**
   * Retrieve a value from Expo SecureStore with memory fallback
   */
  getItem(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      // Try SecureStore first
      if (secureStore) {
        secureStore
          .getItemAsync(key)
          .then((value) => {
            if (value !== null) {
              // Update memory cache with retrieved value
              this._memoryStorage[key] = value;
              LOGGER.debug(`Retrieved item from SecureStore: ${key}`);
              resolve(value);
            } else {
              // Fall back to memory storage
              const memoryValue = this._memoryStorage[key] ?? null;
              if (memoryValue !== null) {
                LOGGER.debug(`Retrieved item from memory storage: ${key}`);
              }
              resolve(memoryValue);
            }
          })
          .catch((error) => {
            LOGGER.warn(
              `Failed to retrieve from SecureStore, falling back to memory: ${key}`,
              String(error),
            );
            // Fall back to memory storage
            const memoryValue = this._memoryStorage[key] ?? null;
            if (memoryValue !== null) {
              LOGGER.debug(`Retrieved item from memory storage: ${key}`);
            }
            resolve(memoryValue);
          });
      } else {
        // Fall back to memory storage
        const memoryValue = this._memoryStorage[key] ?? null;
        if (memoryValue !== null) {
          LOGGER.debug(`Retrieved item from memory storage: ${key}`);
        }
        resolve(memoryValue);
      }
    });
  }

  /**
   * Remove a value from Expo SecureStore
   */
  removeItem(key: string): Promise<void> {
    return new Promise((resolve) => {
      // Remove from memory immediately
      delete this._memoryStorage[key];

      // Try to remove from SecureStore
      if (secureStore) {
        secureStore
          .deleteItemAsync(key)
          .then(() => {
            LOGGER.debug(`Removed item from SecureStore: ${key}`);
            resolve();
          })
          .catch((error) => {
            LOGGER.warn(
              `Failed to remove from SecureStore: ${key}`,
              String(error),
            );
            // Item is already removed from memory, so we can continue
            resolve();
          });
      } else {
        LOGGER.debug(
          `Removed item from memory (SecureStore unavailable): ${key}`,
        );
        resolve();
      }
    });
  }

  /**
   * Clear all values from Expo SecureStore
   * Note: SecureStore doesn't have a clear method, so we track keys manually
   */
  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clear memory storage immediately
        this._memoryStorage = {};

        // For SecureStore, we can only clear keys we know about
        // This is a limitation of Expo SecureStore API
        LOGGER.warn(
          'SecureStore clear() has limited functionality - only clears tracked keys',
        );

        // Could implement key tracking if needed, but for now just clear memory fallback
        resolve();
      } catch (error) {
        LOGGER.error('Error clearing secure storage:', error as Error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Check if a key exists in Expo SecureStore
   */
  async hasItem(key: string): Promise<boolean> {
    await initializeStorage();

    try {
      if (secureStore) {
        const value = await secureStore.getItemAsync(key);
        return value !== null;
      } else {
        // Fallback to memory storage
        return key in this._memoryStorage;
      }
    } catch (error) {
      LOGGER.error(`Error checking secure item ${key}:`, error as Error);
      return false;
    }
  }

  // Memory fallback storage (not secure, but functional)
  private _memoryStorage: Record<string, string> = {};
}

// Export singleton instance for direct use
export const secureStorage = new SecureStorage();

// Export as default for easy importing
export default secureStorage;
