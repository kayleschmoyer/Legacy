// Test setup for React Native app
// No longer need @testing-library/jest-native as it's deprecated
// Built-in matchers are available in @testing-library/react-native v12.4+

// AsyncStorage is backed by a native module that throws under Jest (no native
// runtime). Provide a self-contained in-memory mock so any module that imports
// it — e.g. the last-visited-league persistence used by the league screens
// (LS-6694) — can be rendered and exercised in tests.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) =>
        Promise.resolve(store.has(key) ? store.get(key) : null),
      ),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store.clear();
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve([...store.keys()])),
    },
  };
});
