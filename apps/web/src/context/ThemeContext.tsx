/**
 * ThemeContext — manages dark/light/system theme preference for the web app.
 *
 * - Persists the preference inside the existing `ls_user_preferences` blob
 *   in localStorage so PreferencesPage and ThemeContext share one source.
 * - Listens to OS `prefers-color-scheme` changes for "system" mode.
 * - Exposes `resolvedTheme` ('light' | 'dark') consumed by main.tsx to drive
 *   TamaguiProvider's active theme.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const PREFS_KEY = 'ls_user_preferences';

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

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return 'system';
    const parsed = JSON.parse(raw) as { theme?: ThemePreference };
    return parsed.theme ?? 'system';
  } catch {
    return 'system';
  }
}

function persistPreference(pref: ThemePreference): void {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...existing, theme: pref }),
    );
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
