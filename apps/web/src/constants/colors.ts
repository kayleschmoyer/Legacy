/**
 * ──────────────────────────────────────────────────────────────
 * Centralized color constants for the Legacy Sports web app.
 *
 * For Tamagui component props (color, backgroundColor, borderColor, etc.)
 * prefer `$tokenName` references from the tamagui-config themes.
 *
 * Use these constants only when raw hex/rgba is required in CSS strings
 * (gradients, box-shadows, transitions) or when a Tamagui token mapping
 * does not exist for a particular value.
 *
 * These values mirror lib/tamagui-config — keep them in sync.
 * ──────────────────────────────────────────────────────────────
 */

// ─── Utility ────────────────────────────────────────────────

/** Convert a hex color to an rgba() string at the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Backgrounds & Surfaces ────────────────────────────────

export const BG_DARK = '#0A0F1A';
export const SURFACE_SUBTLE = '#0D1526';
export const SURFACE_PANEL = '#111B2F';
export const SURFACE_CARD = '#16223A';
export const OUTLINE_SUBTLE = '#1C2740';
export const PANEL_BORDER = '#1F2D48';

// ─── Brand Heritage ────────────────────────────────────────

export const BRAND_NAVY = '#1B3A5C';
export const BRAND_NAVY_LIGHT = '#2C4A7C';
export const BRAND_NAVY_DARK = '#143050';
export const BRAND_SEAM_RED = '#C41E3A';
export const BRAND_SEAM_RED_DARK = '#8B1A2B';
export const BRAND_SEAM_RED_LIGHT = '#E63950';
export const BRAND_GOLD = '#C5A55A';
export const BRAND_GOLD_PRESS = '#A8894A';
export const BRAND_GOLD_LIGHT = '#D4BB78';
export const BRAND_GOLD_DARK = '#A68B3E';

// ─── Position Colors (baseball-themed) ─────────────────────

export const POS_PITCHER = '#C41E3A';
export const POS_CATCHER = '#7C8794';
export const POS_INFIELD = '#8B6F47';
export const POS_OUTFIELD = '#2D6A4F';
export const POS_UTILITY = '#C5A55A';

export const POSITION_COLORS: Record<string, string> = {
  C: POS_CATCHER,
  '1B': POS_INFIELD,
  '2B': POS_INFIELD,
  '3B': POS_INFIELD,
  SS: POS_INFIELD,
  OF: POS_OUTFIELD,
  P: POS_PITCHER,
};

export function getPositionColor(position: string): string {
  return POSITION_COLORS[position] ?? POS_UTILITY;
}

// ─── Text ──────────────────────────────────────────────────

export const TEXT_HIGH_CONTRAST = '#F5F7FA'; // $color12
export const TEXT_PRIMARY = '#F8FAFC'; // $color
export const TEXT_MUTED = '#9CAAC5'; // $textMuted

// ─── Blues (primary accent / links) ────────────────────────

export const BLUE = '#3B82F6'; // $blue9
export const BLUE_LIGHT = '#60A5FA'; // $blue10
export const BLUE_LIGHTER = '#93C5FD'; // $blue11
export const BLUE_DEEP = '#2563EB'; // blue-600
export const BLUE_ALT = '#3366FF'; // stats search button

// ─── Greens (success / outfield) ───────────────────────────

export const GREEN = '#22C55E'; // $green8
export const GREEN_LIGHT = '#4ADE80'; // $green9
export const GREEN_LIGHTER = '#86EFAC'; // $green10
export const GREEN_DEEP = '#16A34A';
export const EMERALD = '#059669';
export const EMERALD_DARK = '#047857';
export const EMERALD_LIGHT = '#10B981';
export const EMERALD_LIGHTER = '#34D399';

// ─── Reds (error) ──────────────────────────────────────────

export const RED = '#DC2626';
export const RED_DARK = '#991B1B';

// ─── Ambers & Golds (warning) ──────────────────────────────

export const AMBER = '#F59E0B'; // $amber9
export const AMBER_LIGHT = '#FBBF24'; // $amber10
export const AMBER_DARK = '#D97706'; // $amber8
export const ORANGE = '#F97316';
export const YELLOW = '#EAB308';

// ─── Violets / AI Feature Accents ──────────────────────────

export const VIOLET = '#8B5CF6';
export const VIOLET_LIGHT = '#A78BFA';
export const VIOLET_DARK = '#7C3AED';
export const INDIGO = '#6366F1';
export const PURPLE = '#A855F7';
export const PURPLE_LIGHT = '#C084FC';
export const PINK = '#EC4899';

// ─── Slate / Muted ─────────────────────────────────────────

export const SLATE_500 = '#64748B';
export const SLATE_400 = '#94A3B8';
export const SLATE_300 = '#CBD5E1';
export const SLATE_100 = '#F1F5F9';
export const GRAY_50 = '#F9FAFB';

// ─── Neutrals ──────────────────────────────────────────────

export const GRAY = '#6B7280';
export const GRAY_LIGHT = '#9CA3AF';
export const WHITE = '#FFFFFF';
export const BLACK = '#000000';

// ─── Pre-built CSS Gradients ───────────────────────────────
// Use these in `style` objects where Tamagui tokens can't be applied.

export const GRADIENT_ACCENT_GREEN = `linear-gradient(90deg, ${GREEN}, ${GREEN_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_NAVY = `linear-gradient(90deg, ${BRAND_NAVY}, ${BRAND_NAVY_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_AMBER = `linear-gradient(90deg, ${AMBER}, ${AMBER_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_PURPLE = `linear-gradient(90deg, ${PURPLE}, ${PURPLE_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_GRAY = `linear-gradient(90deg, ${GRAY}, ${GRAY_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_BRAND = `linear-gradient(90deg, ${BLUE}, ${VIOLET}, ${PINK})`;

export const GRADIENT_BOARD_BG = `linear-gradient(135deg, ${BG_DARK} 0%, ${SURFACE_PANEL} 50%, ${BRAND_NAVY} 100%)`;
export const GRADIENT_SEAM_RED = `linear-gradient(135deg, ${BRAND_SEAM_RED} 0%, ${BRAND_SEAM_RED_DARK} 100%)`;
export const GRADIENT_ERROR = `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`;
export const GRADIENT_SUCCESS = `linear-gradient(135deg, ${EMERALD} 0%, ${EMERALD_DARK} 100%)`;
export const GRADIENT_WARNING = `linear-gradient(135deg, ${AMBER} 0%, ${AMBER_DARK} 100%)`;
export const GRADIENT_NAVY = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`;
export const GRADIENT_GOLD = `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_PRESS} 100%)`;
export const GRADIENT_WHITE_CARD = `linear-gradient(135deg, ${WHITE} 0%, ${SLATE_100} 100%)`;
export const GRADIENT_BUTTON_PRIMARY = `linear-gradient(135deg, ${BLUE}, ${INDIGO})`;
export const GRADIENT_BUTTON_SAVE = `linear-gradient(135deg, ${BLUE}, ${BLUE_DEEP})`;
export const GRADIENT_AVATAR = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${VIOLET} 100%)`;

// ─── Semi-transparent Overlays ─────────────────────────────

export const OVERLAY_BLACK_30 = 'rgba(0, 0, 0, 0.3)';
export const OVERLAY_BLACK_40 = 'rgba(0, 0, 0, 0.4)';
export const OVERLAY_WHITE_05 = 'rgba(255, 255, 255, 0.05)';
export const OVERLAY_WHITE_10 = 'rgba(255, 255, 255, 0.1)';

// ─── Injury / Status Border Colors ────────────────────────

export const INJURY_HEALTHY = '#22C55E';
export const INJURY_QUESTIONABLE = '#FBBF24';
export const INJURY_OUT = '#EF4444';
