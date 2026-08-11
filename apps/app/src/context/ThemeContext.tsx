/**
 * ThemeContext — manages dark/light/system theme preference for the mobile app.
 *
 * - Uses React Native's `Appearance` API for system theme detection.
 * - `Appearance.setColorScheme()` overrides the app's theme at the OS level
 *   for the current app session (available since RN 0.72/0.75).
 * - Preference is persisted locally in expo-secure-store (device/app-scoped —
 *   wiped on uninstall) and, via `ThemeServerSync` below, to the user's
 *   account (`User.themePreference`) so it survives reinstall/re-login.
 * - `useColorScheme()` from react-native is used so the theme updates
 *   reactively when the OS theme changes while in "system" mode.
 */
import { LOGGER } from '@legacy-sports/logging';
import { secureStorage } from '@legacy-sports/shared-components';
import {
  useGetUserByIdQuery,
  useUpdateUserThemeMutation,
} from '@legacy-sports/graphql';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

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

const THEME_KEY = 'ls_theme_preference';

function persistPreference(pref: ThemePreference): void {
  secureStorage.setItem(THEME_KEY, pref).catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.error('Failed to persist theme preference', err);
  });
}

/* ── Context ─────────────────────────────────────────── */

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themePreference: 'system',
  resolvedTheme: 'light',
  setThemePreference: () => undefined,
});

/* ── Provider ─────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Load persisted theme preference on mount
  useEffect(() => {
    void (async () => {
      try {
        // hasItem() triggers lazy initialization of SecureStore on native
        await secureStorage.hasItem(THEME_KEY);
        const stored = await secureStorage.getItem(THEME_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreference(stored);
          if (stored !== 'system') {
            Appearance.setColorScheme(stored);
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to load theme preference', err);
        setPreference('system');
      }
    })();
  }, []);

  // useColorScheme() is reactive: picks up both manual Appearance.setColorScheme()
  // and OS-level theme changes in real-time.
  const systemColorScheme = useColorScheme();
  const systemTheme: ResolvedTheme =
    systemColorScheme === 'dark' ? 'dark' : 'light';

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  const setThemePreference = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    persistPreference(pref);

    // Drive React Native's color scheme so native components + useColorScheme()
    // reflect the user's explicit choice within this session.
    if (pref === 'system') {
      Appearance.setColorScheme('unspecified'); // revert to OS
    } else {
      Appearance.setColorScheme(pref);
    }
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

/* ── Server sync (LS-8767) ──────────────────────────────── */

/**
 * Non-rendering bridge that syncs the user's theme preference with the
 * backend so the choice survives an app uninstall/reinstall, which wipes the
 * local secure-store value (mirrors the web `ThemeServerSync`, LS-4913).
 * Must be mounted inside both `ApolloProvider` and `ThemeProvider`.
 *
 * `userId` is passed in by the caller (the native secure-store JWT's id, with
 * the BYPASS_AUTH LOCAL_USER sentinel already excluded) rather than read here
 * via `useCurrentUserInfo`, so this module doesn't pull in the OAuth hook's
 * native-only dependency chain (Apple/Discord/Google sign-in) for every
 * screen that merely reads `useThemeContext()`.
 *
 * On first hydration:
 * - If the server has a value, adopt it locally (overriding whatever the
 *   local secure-store load resolved to, e.g. the 'system' default after a
 *   fresh install).
 * - If the server has no value, leave the local preference as-is.
 *
 * After hydration, any user-driven `setThemePreference` change is persisted
 * to the server best-effort.
 */
export function ThemeServerSync({
  userId,
}: {
  userId: number | undefined;
}): null {
  const { themePreference, setThemePreference } = useThemeContext();

  // cache-and-network so a freshly-opened session still picks up a theme
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
      // secure storage and will retry on the next change. Log so backend or
      // network failures are observable instead of silently swallowed.
      LOGGER.error(
        'Failed to sync user theme preference to server',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }, [themePreference, userId, updateUserTheme]);

  return null;
}
