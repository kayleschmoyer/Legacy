// Test setup for React Native app
// No longer need @testing-library/jest-native as it's deprecated
// Built-in matchers are available in @testing-library/react-native v12.4+

// Set global test timeout to 30 seconds, matching apps/web/src/test-setup.ts
// (LS-8987). Jest's 5000ms default leaves no margin for genuinely async
// effects (e.g. ConversationThread's WebSocket connect, which awaits a
// keychain read before constructing the client) when nx's parallel:5
// fan-out — each project running its own maxWorkers:2 Jest workers
// (jest.preset.js) — oversubscribes CPU during a full-suite run.
jest.setTimeout(30000);

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

// expo-audio ships ESM and needs the native audio module, neither of which
// exists under jest. The shared TouchdownHorn (LS-10195) imports it, and every
// spec that renders the matchup scoreboard pulls that in transitively.
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
  }),
}));
