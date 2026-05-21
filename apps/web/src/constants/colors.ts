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
/** Light-mode page/panel surface. Mirrors brandLight.surfacePanel in tamagui-config. */
export const BG_LIGHT = '#EFF4FB';
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

/** Error toast / alert surface colors. Mirrors Tamagui `red1` in both themes. */
export const ERROR_BG_LIGHT = 'var(--red1)';
export const ERROR_BG_DARK = 'var(--red1)';
/** Text colors on error surfaces. Mirrors Tamagui `red11` in both themes. */
export const ERROR_TEXT_LIGHT = 'var(--red11)';
export const ERROR_TEXT_DARK = 'var(--red11)';

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
export const GRADIENT_AVATAR = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_GOLD} 100%)`;

// ─── Semi-transparent Overlays ─────────────────────────────

export const OVERLAY_BLACK_12 = 'rgba(0, 0, 0, 0.12)';
export const OVERLAY_BLACK_30 = 'rgba(0, 0, 0, 0.3)';
export const OVERLAY_BLACK_40 = 'rgba(0, 0, 0, 0.4)';
export const OVERLAY_WHITE_05 = 'rgba(255, 255, 255, 0.05)';
export const OVERLAY_WHITE_10 = 'rgba(255, 255, 255, 0.1)';

// ─── Brand Partner Colors ──────────────────────────────────

/** Discord brand color (Blurple). */
export const DISCORD_BLURPLE = '#5865F2';
/** Discord brand hover color (darker Blurple). */
export const DISCORD_BLURPLE_DARK = '#4752C4';

// ─── Injury / Status Border Colors ────────────────────────

export const INJURY_HEALTHY = '#22C55E';
export const INJURY_QUESTIONABLE = '#FBBF24';
export const INJURY_OUT = '#EF4444';

// ─── Extended Surface & Border Tokens ──────────────────────

/** Deep background — hero panel, elevated surfaces in homepage layouts. */
export const SURFACE_DEEP = '#0F1A2D';
/** Hover/focus surface — used for interactive row hover states. */
export const SURFACE_HOVER = '#1C2A47';
/** Strong border — dividers and card borders at higher contrast than PANEL_BORDER. */
export const BORDER_STRONG = '#2F3B53';
/** Interactive border on hover/focus states. */
export const BORDER_INTERACTIVE = '#4D5D80';

// ─── Extended Text Tokens ───────────────────────────────────

/** Secondary text — labels, subtitles, less-prominent content. */
export const TEXT_SECONDARY = '#8A9BB5';
/** Dim/separator text — separators, decorative mid-tone accents. */
export const TEXT_SEPARATOR = '#445676';
/** Tertiary text — further muted, de-emphasized content. */
export const TEXT_TERTIARY = '#6C80BA';
/** Interface text — high-contrast on dark backgrounds (lighter than TEXT_PRIMARY). */
export const TEXT_INTERFACE = '#E8EDF5';

// ─── Score / Status Colors ──────────────────────────────────

/** Loss accent — score highlighting for losing matchup side. */
export const SCORE_LOSS = '#E07A8C';
/** Warm amber text — "coming soon" labels and soft warning states. */
export const AMBER_WARM = '#E3B870';

// ─── Stats Page Brand Tokens (LS-4612) ──────────────────────
// Design source: docs/design/qtqqKYxMFf1A8GY5NL9GNQ/legacy-sports-stats-page/
// project/ds/colors_and_type.css. Subsequent Stats Page slices
// (LS-4613/4614/4615/4616) consume these by name so the redesign stays
// consistent without re-importing the same literals. Values reuse the
// tokens above where possible — only STATS_BORDER is a new literal.

/** Stats Page border — design-spec shade between PANEL_BORDER and OUTLINE_SUBTLE. */
export const STATS_BORDER = '#1E2D45';

// ─── Design-System Foreground Tokens ────────────────────────
// Mirror the `--fg2` / `--success-fg` / `--info-fg` / `--danger-fg` semantic
// tokens defined in the synced design bundles (e.g. r09ipdRY07dJXR9hh4J1Ug
// — Admin). Use these instead of inlining hex values so consumers stay
// consistent when the bundle is re-synced.

/** Secondary body text on dark backgrounds (--fg2). */
export const TEXT_FG2 = '#DEE6FF';
/** Muted "valid / success" status text (--success-fg). */
export const SUCCESS_FG = '#6FD39A';
/** Muted "info" status text (--info-fg) — used for numeric JSON tinting. */
export const INFO_FG = '#8FB4E8';
/** Deep-amber ink for high-contrast text on a trophy-gold surface. */
export const TEXT_ON_GOLD = '#1B1208';

export const STATS_PAGE_TOKENS = {
  BG_PAGE: BG_DARK,
  BG_SUBTLE: SURFACE_SUBTLE,
  BG_PANEL: SURFACE_PANEL,
  BG_ELEVATED: SURFACE_CARD,
  BRAND_GOLD,
  BRAND_SEAM_RED,
  BRAND_NAVY,
  TEXT_PRIMARY: TEXT_INTERFACE,
  TEXT_SECONDARY,
  BORDER: STATS_BORDER,
} as const;
