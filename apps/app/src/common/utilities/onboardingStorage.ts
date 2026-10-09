/**
 * Mobile wrapper for onboarding-completion persistence (LS-10383).
 *
 * `useOnboardingCompletion` (shared-components) takes a *synchronous*
 * `OnboardingStorage`, but `AsyncStorage` is async. This hydrates the keys the
 * hook reads (`lsonboardingcomplete_<uid>` and the legacy global flag) into
 * memory once, then serves the hook from that cache and writes through to
 * `AsyncStorage` best-effort. The completion key shape and (de)serialization
 * live in `@legacy-sports/shared-components`, shared with web.
 */
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';
import {
  getOnboardingKey,
  LEGACY_ONBOARDING_KEY,
  type OnboardingStorage,
} from '@legacy-sports/shared-components/utils';

function warn(message: string, error: unknown): void {
  // Best-effort persistence — warn (not error) so it doesn't page Rollbar.
  LOGGER.warn(
    message,
    error instanceof Error ? error : new Error(String(error)),
  );
}

/**
 * Builds a synchronous `OnboardingStorage` over an in-memory cache seeded from
 * `AsyncStorage`. Resolves `null` when the read fails, so callers never act on
 * a cache that might be missing a stored completion flag.
 */
export async function loadOnboardingStorage(
  userId: number,
): Promise<OnboardingStorage | null> {
  const keys = [getOnboardingKey(userId), LEGACY_ONBOARDING_KEY];
  let values: (string | null)[];
  try {
    values = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
  } catch (error) {
    warn('Failed to read onboarding completion flag', error);
    return null;
  }
  const cache = new Map<string, string>();
  keys.forEach((key, i) => {
    const value = values[i];
    if (value !== null && value !== undefined) cache.set(key, value);
  });
  return {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      cache.set(key, value);
      AsyncStorage.setItem(key, value).catch((error: unknown) => {
        warn('Failed to persist onboarding completion flag', error);
      });
    },
    removeItem: (key) => {
      cache.delete(key);
      AsyncStorage.removeItem(key).catch((error: unknown) => {
        warn('Failed to clear onboarding key', error);
      });
    },
  };
}

/**
 * The hydrated store for `userId`, or `null` until it has loaded (or if the
 * read failed). The Home tab holds off the completion check while it is `null`.
 */
export function useOnboardingStorage(
  userId: number | null | undefined,
): OnboardingStorage | null {
  const [loaded, setLoaded] = useState<{
    userId: number;
    storage: OnboardingStorage;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadOnboardingStorage(userId).then((storage) => {
      if (!cancelled && storage) setLoaded({ userId, storage });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return useMemo(
    () => (loaded && loaded.userId === userId ? loaded.storage : null),
    [loaded, userId],
  );
}
