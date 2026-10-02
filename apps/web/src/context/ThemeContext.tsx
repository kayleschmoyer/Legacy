/**
 * ThemeContext — manages dark/light/system theme preference for the web app.
 *
 * - Sole owner of the theme preference: persisted under its own
 *   `ls_theme_preference` localStorage key (LS-7078). The `ls_user_preferences`
 *   blob no longer carries `theme`; PreferencesPage reads it from this context.
 * - Listens to OS `prefers-color-scheme` changes for "system" mode.
 * - Exposes `resolvedTheme` ('light' | 'dark') consumed by main.tsx to drive
 *   TamaguiProvider's active theme.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  useGetUserByIdQuery,
  useUpdateUserThemeMutation,
} from '@legacy-sports/graphql';

export type ThemePreference = 'system' | 'light' | 'dark';

const VALID_THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    (VALID_THEME_PREFERENCES as readonly string[]).includes(value)
  );
}
export type ResolvedTheme = 'light' | 'dark';

/** ThemeContext is the sole owner of this key (LS-7078). */
const THEME_KEY = 'ls_theme_preference';
/**
 * Legacy home of `theme` — the shared preferences blob. Only read (once, to
 * migrate existing users) and scrubbed; never written with a theme again.
 */
const LEGACY_PREFS_KEY = 'ls_user_preferences';

/* ── Helpers ──────────────────────────────────────────── */

function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

/** Remove `theme` from the legacy blob so it can never go stale there. */
function scrubLegacyTheme(): void {
  try {
    const raw = localStorage.getItem(LEGACY_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!('theme' in parsed)) return;
    delete parsed.theme;
    localStorage.setItem(LEGACY_PREFS_KEY, JSON.stringify(parsed));
  } catch {
    // Corrupt/unavailable storage: nothing to scrub
  }
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isThemePreference(stored)) return stored;

    // One-time migration: adopt the theme previously kept in the shared blob.
    const raw = localStorage.getItem(LEGACY_PREFS_KEY);
    const legacy = raw ? (JSON.parse(raw) as { theme?: unknown }).theme : null;
    if (isThemePreference(legacy)) {
      localStorage.setItem(THEME_KEY, legacy);
      scrubLegacyTheme();
      return legacy;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

function persistPreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
    scrubLegacyTheme();
  } catch {
    // Storage may be unavailable; silently skip
  }
}

/* ── Context ──────────────────────────────────────────── */

interface ThemeContextValue {
  /** The raw user preference: 'system' | 'light' | 'dark' */
  themePreference: ThemePreference;
  /** The effective applied theme after resolving 'system' */
  resolvedTheme: ResolvedTheme;
  /** Update the preference (persists to localStorage immediately) */
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themePreference: 'system',
  resolvedTheme: 'light',
  setThemePreference: () => undefined,
});

/* ── Provider ─────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] =
    useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Track OS theme changes so "system" mode reacts in real-time
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  // Sync Tamagui theme class to <html> so CSS vars (--background, --color, etc.)
  // are available outside the Theme wrapper div (e.g. on html, body).
  // useLayoutEffect runs synchronously before paint to prevent a flash of
  // incorrect CSS variables when the theme changes.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('t_light', 't_dark');
    root.classList.add(`t_${resolvedTheme}`);
  }, [resolvedTheme]);

  const setThemePreference = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    persistPreference(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themePreference: preference, resolvedTheme, setThemePreference }),
    [preference, resolvedTheme, setThemePreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────── */

export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}

/* ── Server sync (LS-4913) ─────────────────────────────── */

/**
 * Non-rendering bridge that syncs the user's theme preference with the
 * backend so the choice follows them across devices. Must be mounted
 * inside both ApolloProvider and AuthProvider (i.e. somewhere under
 * `AppProvider` in main.tsx).
 *
 * On first hydration:
 * - If the server has a value, adopt it locally (clobbering localStorage
 *   so a freshly-opened mobile browser inherits the desktop choice).
 * - If the server has no value but local does (and it is not the
 *   default "system"), push the local value up.
 *
 * After hydration, any user-driven `setThemePreference` change is
 * persisted to the server best-effort.
 */
export function ThemeServerSync(): null {
  const { themePreference, setThemePreference } = useThemeContext();
  const auth = useAuth();
  const userId = auth?.user?.id;

  // cache-and-network so a freshly-opened browser still picks up a theme
  // that was set on another device after this user's cache was warmed.
  const { data } = useGetUserByIdQuery({
    variables: { id: userId ?? 0 },
    skip: !userId,
    fetchPolicy: 'cache-and-network',
  });
  const [updateUserTheme] = useUpdateUserThemeMutation();

  const hydratedRef = useRef(false);
  const lastSyncedRef = useRef<ThemePreference | null>(null);

  // Hydrate from server once per session.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!userId || !data?.user) return;

    const serverTheme = data.user.themePreference;
    if (isThemePreference(serverTheme)) {
      if (serverTheme !== themePreference) {
        setThemePreference(serverTheme);
      }
      lastSyncedRef.current = serverTheme;
    } else {
      // Server has no preference yet. If the user had previously picked
      // a non-default locally, push it up so the next device inherits it.
      lastSyncedRef.current = null;
    }
    hydratedRef.current = true;
  }, [data, userId, themePreference, setThemePreference]);

  // Push subsequent local changes up.
  useEffect(() => {
    if (!hydratedRef.current || !userId) return;
    if (themePreference === lastSyncedRef.current) return;
    lastSyncedRef.current = themePreference;
    void updateUserTheme({
      variables: { themePreference },
    }).catch((error: unknown) => {
      // Best-effort sync: the local preference is already persisted to
      // localStorage and will retry on the next change. Log so backend or
      // network failures are observable instead of silently swallowed.
      LOGGER.error(
        'Failed to sync user theme preference to server',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }, [themePreference, userId, updateUserTheme]);

  return null;
}
