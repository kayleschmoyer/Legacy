/**
 * Raw palette values for the native draft board.
 *
 * The redesign leans on react-native-svg strokes, alpha-tinted position fills,
 * and Tamagui gradient stops — all places a `$token` prop can't reach, so they
 * need resolved strings (see `.agents/skills/ui/SKILL.md` → "Raw-CSS Strings").
 * Every value still comes from `@legacy-sports/design-tokens` and flips with the
 * active theme; nothing here is a literal.
 */

import { colors, withAlpha } from '@legacy-sports/design-tokens';
import { useThemeTokens } from '../../hooks/useThemeTokens';

export interface DraftPalette {
  resolvedTheme: 'light' | 'dark';
  /** Page/panel/card surfaces and outlines. */
  surface: ReturnType<typeof useThemeTokens>['surface'];
  /** Text tiers fg1 (primary) → fg4 (faintest). */
  text: ReturnType<typeof useThemeTokens>['text'];
  /** Aged-gold accent, desaturated in light mode for AA contrast. */
  gold: { gold: string; goldLight: string; goldDark: string };
  /** Countdown ring / clock colors by urgency. */
  clock: { calm: string; warning: string; danger: string };
  /**
   * Modal scrim. Deliberately dark in both themes — a light-on-light scrim
   * would leave the raised sheet/announcement card indistinguishable from the
   * page behind it.
   */
  scrim: string;
}

export function useDraftPalette(): DraftPalette {
  const { resolvedTheme, surface, text, brand, semantic } = useThemeTokens();
  const gold =
    resolvedTheme === 'light'
      ? colors.light.brandGoldOverride
      : {
          gold: brand.gold,
          goldLight: brand.goldLight,
          goldDark: brand.goldDark,
        };

  return {
    resolvedTheme,
    surface,
    text,
    gold,
    clock: {
      calm: gold.goldLight,
      warning: semantic.warningFg,
      danger: semantic.dangerFg,
    },
    scrim: withAlpha(colors.dark.surface.bg, 0.78),
  };
}

/** Urgency tier for the pick clock — drives both the ring and the digits. */
export function clockToneFor(
  secondsRemaining: number,
): 'calm' | 'warning' | 'danger' {
  if (secondsRemaining <= 10) return 'danger';
  if (secondsRemaining <= 30) return 'warning';
  return 'calm';
}
