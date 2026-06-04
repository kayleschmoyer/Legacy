/**
 * ThemeContext — manages dark/light/system theme preference for the mobile app.
 *
 * - Uses React Native's `Appearance` API for system theme detection.
 * - `Appearance.setColorScheme()` overrides the app's theme at the OS level
 *   for the current app session (available since RN 0.72/0.75).
 * - Preference is stored in a module-level variable for the session.
 *   To persist across launches, replace `sessionStore` with AsyncStorage.
 * - `useColorScheme()` from react-native is used so the theme updates
 *   reactively when the OS theme changes while in "system" mode.
 */
import { LOGGER } from '@legacy-sports/logging';
import { secureStorage } from '@legacy-sports/shared-components';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

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
