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
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const PREFS_KEY = 'ls_user_preferences';

/* ── Simple session store (replace with AsyncStorage for persistence) ── */
const sessionStore: Record<string, string> = {};

function readStoredPreference(): ThemePreference {
  try {
    const raw = sessionStore[PREFS_KEY];
    if (!raw) return 'system';
    const parsed = JSON.parse(raw) as { theme?: ThemePreference };
    return parsed.theme ?? 'system';
  } catch {
    return 'system';
  }
}

function persistPreference(pref: ThemePreference): void {
  try {
    const raw = sessionStore[PREFS_KEY];
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    sessionStore[PREFS_KEY] = JSON.stringify({ ...existing, theme: pref });
  } catch {
    // ignore
  }
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
  const [preference, setPreference] =
    useState<ThemePreference>(readStoredPreference);

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
      Appearance.setColorScheme(null); // revert to OS
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
