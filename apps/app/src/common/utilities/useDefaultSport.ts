import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LOGGER } from '@legacy-sports/logging';
import {
  DEFAULT_SPORT_FALLBACK,
  type DefaultSport,
  parseDefaultSport,
  USER_PREFERENCES_STORAGE_KEY,
} from '@legacy-sports/shared-components/utils';

/**
 * Read the persisted `defaultSport` preference from device storage.
 *
 * On native this reads AsyncStorage; on web (Expo web) it reads sessionStorage —
 * matching exactly where the Preferences screen persists the value. Validation
 * is the shared `parseDefaultSport` (also used by the web app), so a missing or
 * corrupt blob falls back to baseball. A storage failure logs a warning and
 * does the same. Exported for unit testing.
 */
export async function readDefaultSport(): Promise<DefaultSport> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof sessionStorage === 'undefined'
          ? null
          : sessionStorage.getItem(USER_PREFERENCES_STORAGE_KEY)
        : await AsyncStorage.getItem(USER_PREFERENCES_STORAGE_KEY);
    return parseDefaultSport(raw);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.warn('readDefaultSport failed; falling back to baseball', err, {
      storageKey: USER_PREFERENCES_STORAGE_KEY,
    });
    return DEFAULT_SPORT_FALLBACK;
  }
}

/**
 * Resolve the user's `defaultSport` preference for a screen.
 *
 * Re-reads on every screen focus via `useFocusEffect` so a change made on the
 * Preferences screen takes effect when the user navigates back. Starts at the
 * baseball fallback and updates once the async read resolves.
 */
export function useDefaultSport(): DefaultSport {
  const [defaultSport, setDefaultSport] = useState<DefaultSport>(
    DEFAULT_SPORT_FALLBACK,
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readDefaultSport().then((sport) => {
        if (active) setDefaultSport(sport);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return defaultSport;
}
