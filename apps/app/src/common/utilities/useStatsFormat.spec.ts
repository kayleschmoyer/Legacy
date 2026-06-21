import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { readStatsFormat, useStatsFormat } from './useStatsFormat';

// expo-router's useFocusEffect runs its callback on screen focus; under test we
// run it once on mount so the hook performs its initial read.
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      useEffect(() => cb(), [cb]);
    },
  };
});

// Platform defaults to 'ios' under the RN jest preset, so readStatsFormat takes
// the AsyncStorage branch — the in-memory mock in test-setup backs it.
const STORAGE_KEY = 'ls_user_preferences';

describe('readStatsFormat', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("defaults to 'standard' when no preference is stored", async () => {
    await expect(readStatsFormat()).resolves.toBe('standard');
  });

  it("returns 'expanded' when the stored preference is expanded", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ statsFormat: 'expanded' }),
    );
    await expect(readStatsFormat()).resolves.toBe('expanded');
  });

  it("returns 'standard' when the stored preference is standard", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ statsFormat: 'standard' }),
    );
    await expect(readStatsFormat()).resolves.toBe('standard');
  });

  it("falls back to 'standard' for an unrecognized statsFormat value", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ statsFormat: 'compact' }),
    );
    await expect(readStatsFormat()).resolves.toBe('standard');
  });

  it("falls back to 'standard' when statsFormat is absent from a valid prefs blob", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: 'dark', defaultSport: 'baseball' }),
    );
    await expect(readStatsFormat()).resolves.toBe('standard');
  });

  it("falls back to 'standard' on corrupt JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not valid json');
    await expect(readStatsFormat()).resolves.toBe('standard');
  });
});

describe('useStatsFormat', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("starts at 'standard' and resolves to the stored preference on focus", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ statsFormat: 'expanded' }),
    );

    const { result } = renderHook(() => useStatsFormat());

    // Initial synchronous value before the async read resolves.
    expect(result.current).toBe('standard');
    // After the focus-driven read resolves, the saved preference is reflected.
    await waitFor(() => expect(result.current).toBe('expanded'));
  });

  it("stays at 'standard' when no preference is stored", async () => {
    const { result } = renderHook(() => useStatsFormat());
    await waitFor(() => expect(result.current).toBe('standard'));
  });
});
