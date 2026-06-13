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

// Internal registry key — never exposed as a user-visible key.
const KNOWN_KEYS_REGISTRY = '__secure_storage_keys__';

/**
 * Tracks keys written through this module so `clear()` can delete them
 * from SecureStore. Persisted under KNOWN_KEYS_REGISTRY so it survives
 * app restarts — previously this was in-memory only, causing `clear()`
 * to silently leave stale tokens in SecureStore after a restart.
 */
const knownKeys = new Set<string>();

const persistKnownKeys = async (
  store: NonNullable<typeof secureStore>,
): Promise<void> => {
  try {
    await store.setItemAsync(
      KNOWN_KEYS_REGISTRY,
      JSON.stringify([...knownKeys]),
    );
  } catch (error) {
    LOGGER.warn(
      'Failed to persist known-keys registry to SecureStore',
      String(error),
    );
  }
};

const initializeStorage = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;
  try {
    secureStore = await import('expo-secure-store');
    // Restore the known-keys registry so clear() can reach keys written
    // in a previous session without relying on getItem being called first.
    try {
      const raw = await secureStore.getItemAsync(KNOWN_KEYS_REGISTRY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.every((k): k is string => typeof k === 'string')
        ) {
          parsed.forEach((k) => knownKeys.add(k));
        } else {
          LOGGER.warn(
            'known-keys registry in SecureStore had unexpected shape; ignoring',
          );
        }
      }
    } catch (error) {
      LOGGER.warn(
        'Failed to restore known-keys registry from SecureStore',
        String(error),
      );
    }
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

export class SecureStorage implements ISecureStorage {
  async setItem(key: string, value: string): Promise<void> {
    await initializeStorage();
    memory.set(key, value);
    knownKeys.add(key);
    if (secureStore) {
      try {
        await secureStore.setItemAsync(key, value);
        await persistKnownKeys(secureStore);
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
          knownKeys.add(key);
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
        await persistKnownKeys(secureStore);
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
      // expo-secure-store has no clear API — purge each tracked key plus
      // the registry itself so it doesn't resurrect keys after a restart.
      await Promise.all(
        [...keys, KNOWN_KEYS_REGISTRY].map((key) =>
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
