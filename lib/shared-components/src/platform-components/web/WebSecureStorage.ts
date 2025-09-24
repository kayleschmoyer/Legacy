import { ISecureStorage } from '../types/auth';

/**
 * Web SecureStorage implementation using localStorage
 * Note: This is not as secure as mobile implementations, but provides consistency
 * For production, consider upgrading to IndexedDB with encryption or WebCrypto API
 */
export class WebSecureStorage implements ISecureStorage {
  private readonly prefix = 'legacy_sports_secure_';

  setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage not available');
    }

    try {
      // In production, you might want to encrypt the value here
      localStorage.setItem(this.prefix + key, value);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(`Failed to store item: ${error}`));
    }
  }

  getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve(null);
    }

    try {
      const value = localStorage.getItem(this.prefix + key);
      // In production, you might want to decrypt the value here
      return Promise.resolve(value);
    } catch (error) {
      console.warn('Failed to retrieve item from localStorage:', error);
      return Promise.resolve(null);
    }
  }

  removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve();
    }

    try {
      localStorage.removeItem(this.prefix + key);
      return Promise.resolve();
    } catch (error) {
      console.warn('Failed to remove item from localStorage:', error);
      return Promise.resolve();
    }
  }

  clear(): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve();
    }

    try {
      // Remove only our prefixed items
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      }
      return Promise.resolve();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
      return Promise.resolve();
    }
  }

  isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve(false);
    }

    try {
      // Test localStorage availability
      const testKey = this.prefix + 'test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
}

// Export singleton instance
export const webSecureStorage = new WebSecureStorage();
