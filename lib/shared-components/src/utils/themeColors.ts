/**
 * Resolved theme color values for the active light/dark theme.
 *
 * Tamagui components should use `$token` string props (e.g. `color="$color"`),
 * which resolve against the active `<Theme>` automatically. Use this hook only
 * for hosts that CANNOT consume `$token` strings: React Native style objects,
 * raw SVG `stroke`/`fill`, `placeholderTextColor`, and web `<style>` CSS
 * template strings.
 *
 * Values are sourced from `@legacy-sports/design-tokens` — the same token
 * package the Tamagui themes mirror — so there is a single source of truth.
 */
import { useThemeName } from 'tamagui';
import { colors } from '@legacy-sports/design-tokens';

export interface ResolvedThemeColors {
  /** Page background — `$background`. */
  background: string;
  /** Panel surface — `$surfacePanel`. */
  surfacePanel: string;
  /** Elevated card surface — `$surfaceCard`. */
  surfaceCard: string;
  /** Panel/card border — `$surfacePanelBorder`. */
  surfacePanelBorder: string;
  /** Subtle outline — `$outlineSubtle`. */
  outlineSubtle: string;
  /** Strong outline — `$outlineStrong`. */
  outlineStrong: string;
  /** Primary foreground text — `$color`. */
  color: string;
  /** Muted/secondary text — `$textMuted`. */
  textMuted: string;
  /** Tertiary text — `$color10`. */
  color10: string;
  /** Translucent glass surface — `$glassSurface`. */
  glassSurface: string;
  /** Lighter translucent glass surface — `$glassSurfaceLight`. */
  glassSurfaceLight: string;
}

/**
 * Read resolved hex/rgba color values for the active Tamagui theme. Re-renders
 * on theme change because it subscribes to the active theme name.
 */
export function useThemeColors(): ResolvedThemeColors {
  const themeName = useThemeName();
  const isLight = themeName.includes('light');
  const palette = isLight ? colors.light : colors.dark;
  const { surface, text, glass } = palette;
  return {
    background: surface.bg,
    surfacePanel: surface.surfacePanel,
    surfaceCard: surface.surfaceCard,
    surfacePanelBorder: surface.panelBorder,
    outlineSubtle: surface.outlineSubtle,
    outlineStrong: surface.outlineDefault,
    color: text.fg1,
    textMuted: text.fg3,
    color10: text.fg4,
    glassSurface: glass.surface,
    glassSurfaceLight: glass.surfaceLight,
  };
}
