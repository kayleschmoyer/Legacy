import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { readDefaultSport, useDefaultSport } from './useDefaultSport';

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

// Platform defaults to 'ios' under the RN jest preset, so readDefaultSport takes
// the AsyncStorage branch — the in-memory mock in test-setup backs it.
const STORAGE_KEY = 'ls_user_preferences';

describe('readDefaultSport', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("defaults to 'baseball' when no preference is stored", async () => {
    await expect(readDefaultSport()).resolves.toBe('baseball');
  });

  it("returns 'football' when the stored preference is football", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultSport: 'football' }),
    );
    await expect(readDefaultSport()).resolves.toBe('football');
  });

  it("falls back to 'baseball' for an unrecognized defaultSport value", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultSport: 'hockey' }),
    );
    await expect(readDefaultSport()).resolves.toBe('baseball');
  });

  it("falls back to 'baseball' on corrupt JSON", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not valid json');
    await expect(readDefaultSport()).resolves.toBe('baseball');
  });

  it("falls back to 'baseball' when storage throws", async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(readDefaultSport()).resolves.toBe('baseball');
  });
});

describe('useDefaultSport', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("starts at 'baseball' and resolves to the stored preference on focus", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultSport: 'football' }),
    );

    const { result } = renderHook(() => useDefaultSport());

    expect(result.current).toBe('baseball');
    await waitFor(() => expect(result.current).toBe('football'));
  });

  it("stays at 'baseball' when no preference is stored", async () => {
    const { result } = renderHook(() => useDefaultSport());
    await waitFor(() => expect(result.current).toBe('baseball'));
  });
});
