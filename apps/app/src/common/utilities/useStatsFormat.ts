import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Stats-format display preference shared with the Preferences screen and the
 * web app. `standard` shows the core column set; `expanded` adds the premium
 * columns. Mirrors the union used by `apps/web` `readStatsFormat()` and the
 * `StatsFormat` type in the mobile preferences screen.
 */
export type StatsFormat = 'standard' | 'expanded';

// AsyncStorage key the Preferences screen (apps/app .../preferences.tsx) writes
// the serialized UserPreferences object under. The same key is read here so the
// Player Stats screen honors the user's saved choice (LS-7106 / PST-002).
const STORAGE_KEY = 'ls_user_preferences';

// Matches the web `readStatsFormat()` default and the mobile DEFAULT_PREFS — an
// absent, corrupt, or unrecognized preference falls back to the standard column
// set rather than silently unlocking the expanded view.
const DEFAULT_STATS_FORMAT: StatsFormat = 'standard';

/**
 * Read the persisted `statsFormat` preference from device storage.
 *
 * On native this reads AsyncStorage; on web (Expo web) it reads sessionStorage —
 * matching exactly where the Preferences screen persists the value so the two
 * round-trip. Any failure (storage unavailable, corrupt JSON, unknown value)
 * logs a warning and falls back to {@link DEFAULT_STATS_FORMAT}. Exported for
 * unit testing.
 */
export async function readStatsFormat(): Promise<StatsFormat> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof sessionStorage === 'undefined'
          ? null
          : sessionStorage.getItem(STORAGE_KEY)
        : await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATS_FORMAT;
    const parsed = JSON.parse(raw) as { statsFormat?: unknown };
    if (
      parsed.statsFormat === 'standard' ||
      parsed.statsFormat === 'expanded'
    ) {
      return parsed.statsFormat;
    }
    return DEFAULT_STATS_FORMAT;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.warn('readStatsFormat failed; falling back to standard', err, {
      storageKey: STORAGE_KEY,
    });
    return DEFAULT_STATS_FORMAT;
  }
}

/**
 * Resolve the user's `statsFormat` preference for a screen.
 *
 * Re-reads on every screen focus via `useFocusEffect` so a change made on the
 * Preferences screen takes effect when the user navigates back — mirroring the
 * web wrapper's `window` focus re-read of the same preference. Starts at the
 * default and updates once the async read resolves.
 */
export function useStatsFormat(): StatsFormat {
  const [statsFormat, setStatsFormat] =
    useState<StatsFormat>(DEFAULT_STATS_FORMAT);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readStatsFormat().then((format) => {
        if (active) setStatsFormat(format);
      });
      // Ignore a late-resolving read after the screen has blurred/unmounted so
      // we never set state on a stale focus cycle.
      return () => {
        active = false;
      };
    }, []),
  );

  return statsFormat;
}
