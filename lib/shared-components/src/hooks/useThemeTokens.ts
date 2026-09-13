import {
  colors,
  type semantic,
  shadowsDark,
  shadowsLight,
} from '@legacy-sports/design-tokens';
import { useThemeName } from 'tamagui';

export interface ThemeTokens {
  /** 'light' | 'dark' — the resolved theme driving every value below. */
  resolvedTheme: 'light' | 'dark';
  surface: typeof colors.dark.surface | typeof colors.light.surface;
  text: typeof colors.dark.text | typeof colors.light.text;
  glass: typeof colors.dark.glass | typeof colors.light.glass;
  shadows: typeof shadowsDark | typeof shadowsLight;
  brand: typeof colors.brand;
  positions: typeof colors.positions;
  semantic: typeof semantic;
}

/**
 * Resolves raw `@legacy-sports/design-tokens` values for the currently
 * active theme, for the narrow set of cases a Tamagui token prop can't
 * cover — gradients, box-shadow / native shadow objects, and other
 * hand-built CSS strings (see `.agents/skills/ui/SKILL.md`). Prefer a
 * Tamagui token (`$surfaceCard`, `$brandNavy`, …) wherever a prop accepts
 * one; this hook exists for the remaining raw-string cases only.
 *
 * Reads the theme via Tamagui's own `useThemeName()` (not the app-level
 * `ThemeContext`) so this hook works identically on web and native without
 * a reverse dependency from `lib/shared-components` onto `apps/*`.
 */
export function useThemeTokens(): ThemeTokens {
  const themeName: string = useThemeName();
  const resolvedTheme: 'light' | 'dark' = themeName.includes('dark')
    ? 'dark'
    : 'light';
  const base = resolvedTheme === 'dark' ? colors.dark : colors.light;

  return {
    resolvedTheme,
    surface: base.surface,
    text: base.text,
    glass: base.glass,
    shadows: resolvedTheme === 'dark' ? shadowsDark : shadowsLight,
    brand: colors.brand,
    positions: colors.positions,
    semantic: colors.semantic,
  };
}
