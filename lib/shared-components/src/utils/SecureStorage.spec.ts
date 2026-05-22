import * as ExpoSecureStoreMock from 'expo-secure-store';

import type { ISecureStorage } from '../platform-components/types/auth';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key: string) =>
      Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
    ),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __reset: () => store.clear(),
  };
});

const mockResetExpoStore = () =>
  (ExpoSecureStoreMock as unknown as { __reset: () => void }).__reset();

const expectMethods = (impl: ISecureStorage) => {
  expect(typeof impl.setItem).toBe('function');
  expect(typeof impl.getItem).toBe('function');
  expect(typeof impl.removeItem).toBe('function');
  expect(typeof impl.clear).toBe('function');
  expect(typeof impl.hasItem).toBe('function');
};

const roundTripContract = (
  name: string,
  load: () => Promise<{
    storage: ISecureStorage;
    reset: () => void | Promise<void>;
  }>,
) => {
  describe(`${name} ISecureStorage conformance`, () => {
    let storage: ISecureStorage;
    let reset: () => void | Promise<void>;

    beforeEach(async () => {
      const loaded = await load();
      storage = loaded.storage;
      reset = loaded.reset;
      await reset();
    });

    afterAll(async () => {
      await reset();
    });

    it('exposes the full ISecureStorage surface', () => {
      expectMethods(storage);
    });

    it('round-trips setItem/getItem', async () => {
      await storage.setItem('jwt', 'token-abc');
      await expect(storage.getItem('jwt')).resolves.toBe('token-abc');
    });

    it('returns null for missing keys', async () => {
      await expect(storage.getItem('nope')).resolves.toBeNull();
    });

    it('hasItem reflects setItem and removeItem', async () => {
      await expect(storage.hasItem('k')).resolves.toBe(false);
      await storage.setItem('k', 'v');
      await expect(storage.hasItem('k')).resolves.toBe(true);
      await storage.removeItem('k');
      await expect(storage.hasItem('k')).resolves.toBe(false);
    });

    it('removeItem makes getItem return null', async () => {
      await storage.setItem('k', 'v');
      await storage.removeItem('k');
      await expect(storage.getItem('k')).resolves.toBeNull();
    });

    it('clear empties the in-process state', async () => {
      await storage.setItem('a', '1');
      await storage.setItem('b', '2');
      await storage.clear();
      await expect(storage.hasItem('a')).resolves.toBe(false);
      await expect(storage.hasItem('b')).resolves.toBe(false);
    });
  });
};

roundTripContract('web (sessionStorage)', async () => {
  const mod = await import('./SecureStorage');
  return {
    storage: mod.secureStorage,
    reset: () => mod.__resetForTesting(),
  };
});

roundTripContract('native (expo-secure-store + memory fallback)', async () => {
  const mod = await import('./SecureStorage.native');
  return {
    storage: mod.secureStorage,
    reset: () => {
      mod.__resetForTesting();
      mockResetExpoStore();
    },
  };
});
