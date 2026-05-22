import { LOGGER } from '@legacy-sports/logging';

import type { ISecureStorage } from '../platform-components/types/auth';

/**
 * Native SecureStorage — uses Expo SecureStore with an in-memory
 * fallback for environments where SecureStore is unavailable
 * (tests, web preview of mobile bundle, SecureStore load failure).
 *
 * Paired with `SecureStorage.ts` via Metro's `.native.ts` resolution.
 * Both files implement `ISecureStorage` exactly; see
 * `platform-components/types/auth.ts` for the canonical contract.
 */

let secureStore: typeof import('expo-secure-store') | null = null;
let initialized = false;

const initializeStorage = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;
  try {
    secureStore = await import('expo-secure-store');
  } catch (error) {
    LOGGER.warn(
      'Expo SecureStore not available, falling back to in-memory storage',
      error instanceof Error ? error.message : String(error),
    );
  }
};

/**
 * Module-private in-memory fallback. Replaces the previous instance
 * field `_memoryStorage`, which was effectively global anyway because
 * the module exports a singleton. Wrapping it in an explicit class
 * makes the lifecycle visible and lets tests reset it deterministically
 * via `__resetForTesting()`.
 */
class InMemoryFallbackStore {
  private data = new Map<string, string>();

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  has(key: string): boolean {
    return this.data.has(key);
  }
}

const memory = new InMemoryFallbackStore();

/**
 * Tracks keys we've written through this instance so `clear()` can
 * delete them from SecureStore — Expo SecureStore has no clear API.
 * This still won't reach keys written by other code paths, but for
 * the auth-token use case (every write goes through this module) it
 * is sufficient and is a strict improvement over the previous
 * memory-only `clear()`.
 */
const knownKeys = new Set<string>();

export class SecureStorage implements ISecureStorage {
  async setItem(key: string, value: string): Promise<void> {
    await initializeStorage();
    memory.set(key, value);
    knownKeys.add(key);
    if (secureStore) {
      try {
        await secureStore.setItemAsync(key, value);
        LOGGER.debug(`Stored item in SecureStore: ${key}`);
      } catch (error) {
        LOGGER.warn(
          `Failed to store in SecureStore, using memory fallback: ${key}`,
          String(error),
        );
      }
    } else {
      LOGGER.debug(`Stored item in memory (SecureStore unavailable): ${key}`);
    }
  }

  async getItem(key: string): Promise<string | null> {
    await initializeStorage();
    if (secureStore) {
      try {
        const value = await secureStore.getItemAsync(key);
        if (value !== null) {
          memory.set(key, value);
          return value;
        }
      } catch (error) {
        LOGGER.warn(
          `Failed to retrieve from SecureStore, falling back to memory: ${key}`,
          String(error),
        );
      }
    }
    return memory.get(key);
  }

  async removeItem(key: string): Promise<void> {
    await initializeStorage();
    memory.delete(key);
    knownKeys.delete(key);
    if (secureStore) {
      try {
        await secureStore.deleteItemAsync(key);
      } catch (error) {
        LOGGER.warn(`Failed to remove from SecureStore: ${key}`, String(error));
      }
    }
  }

  async clear(): Promise<void> {
    await initializeStorage();
    const keys = Array.from(knownKeys);
    memory.clear();
    knownKeys.clear();
    const store = secureStore;
    if (store) {
      await Promise.all(
        keys.map((key) =>
          // expo-secure-store has no clear API — purge each tracked key.
          // Keys written outside this module won't be reached.
          store.deleteItemAsync(key).catch((error: unknown) => {
            LOGGER.warn(
              `Failed to remove from SecureStore during clear: ${key}`,
              String(error),
            );
          }),
        ),
      );
    }
  }

  async hasItem(key: string): Promise<boolean> {
    await initializeStorage();
    if (secureStore) {
      try {
        const value = await secureStore.getItemAsync(key);
        if (value !== null) return true;
      } catch (error) {
        LOGGER.warn(`Failed to check secure item ${key}:`, String(error));
      }
    }
    return memory.has(key);
  }
}

export const secureStorage = new SecureStorage();

/**
 * Reset secure storage state for tests. Clears the in-memory fallback
 * and the cached SecureStore module reference so the next call to
 * `initializeStorage()` re-attempts the dynamic import — letting tests
 * swap the mocked module between runs.
 */
export const __resetForTesting = (): void => {
  memory.clear();
  knownKeys.clear();
  secureStore = null;
  initialized = false;
};

export type { ISecureStorage } from '../platform-components/types/auth';

export default secureStorage;
