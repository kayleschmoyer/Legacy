import { LOGGER } from '@legacy-sports/logging';
import * as SecureStore from 'expo-secure-store';
import { ISecureStorage } from '../types/auth';

/**
 * Mobile SecureStorage implementation using Expo SecureStore
 */
export class MobileSecureStorage implements ISecureStorage {
  private readonly prefix = 'legacy_sports_';

  async setItem(key: string, value: string): Promise<void> {
    if (!SecureStore) {
      throw new Error('SecureStore not available');
    }

    try {
      await SecureStore.setItemAsync(this.prefix + key, value);
    } catch (error) {
      throw new Error(
        `Failed to store item securely: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (!SecureStore) {
      return null;
    }

    try {
      const value = await SecureStore.getItemAsync(this.prefix + key);
      return value;
    } catch (error) {
      LOGGER.warn('Failed to retrieve item from SecureStore:', String(error));
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    if (!SecureStore) {
      return;
    }

    try {
      await SecureStore.deleteItemAsync(this.prefix + key);
    } catch (error) {
      LOGGER.warn('Failed to remove item from SecureStore:', String(error));
    }
  }

  async clear(): Promise<void> {
    if (!SecureStore) {
      return;
    }

    try {
      // SecureStore doesn't have a clear all method, so we need to remove known keys
      // This is a limitation - we'll remove commonly used auth keys
      const keysToRemove = [
        'INTERNAL_JWT',
        'GOOGLE_JWT',
        'REFRESH_TOKEN',
        'ACCESS_TOKEN',
      ];

      await Promise.all(
        keysToRemove.map((key) =>
          SecureStore.deleteItemAsync(this.prefix + key).catch(() => {
            // Ignore errors for keys that don't exist
          }),
        ),
      );
    } catch (error) {
      LOGGER.warn('Failed to clear SecureStore:', String(error));
    }
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(!!SecureStore);
  }
}

// Export singleton instance
export const mobileSecureStorage = new MobileSecureStorage();
