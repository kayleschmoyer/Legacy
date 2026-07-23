// Shared design tokens for the sport-agnostic player-stats shell.
//
// These constants were previously defined inline at the top of the baseball
// `PlayerStatsPage.tsx` monolith. They are hoisted here so every extracted
// shell component (header, tabs, toolbar, sliders, state cards, column picker)
// and both sport configs (baseball + football) draw the same fonts, outlines,
// muted foregrounds, and surface tokens from one place.

import { colors } from '@legacy-sports/design-tokens';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  STATS_PAGE_TOKENS,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
export const FONT_BODY = "'Literata', serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// Outline + muted-foreground scale used across the stats chrome, sourced from
// the sanctioned design-tokens palette (the stats shell is a dark-chrome
// surface in both app themes, so the dark ramp is intentional).
export const OUTLINE_SUBTLE = colors.dark.surface.outlineSubtle;
export const OUTLINE_DEFAULT = colors.dark.surface.outlineDefault;
export const FG3 = colors.dark.text.fg3;
export const FG4 = colors.dark.text.fg4;

/** Scrim behind native modal sheets (60% black). */
export const MODAL_SCRIM = withAlpha(colors.light.text.fg1Strong, 0.6);

// Stats Page surfaces (LS-4612 tokens). Re-exported for clarity at call sites.
export const BG_PAGE = STATS_PAGE_TOKENS.BG_PAGE;
export const BG_PANEL = STATS_PAGE_TOKENS.BG_PANEL;
export const BG_ELEVATED = STATS_PAGE_TOKENS.BG_ELEVATED;

// Export / Share gold-accent button — matches the BRAND_GOLD heritage treatment
// from the Stats Page design (project/stats.css `.sp-btn-ghost` + toast border).
export const GOLD_ACCENT_BUTTON_STYLE = {
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: withAlpha(BRAND_GOLD, 0.4),
  backgroundColor: withAlpha(BRAND_GOLD, 0.08),
  borderStyle: 'solid' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
  minHeight: 40,
};

export const GOLD_ACCENT_BUTTON_LABEL_STYLE = csp({
  color: BRAND_GOLD_LIGHT,
  fontSize: 12,
  fontFamily: FONT_DISPLAY,
  fontWeight: '700' as const,
  letterSpacing: 0.96,
  textTransform: 'uppercase' as const,
});
