/**
 * Centralized color constants for cross-platform use.
 *
 * For Tamagui component props (color, backgroundColor, borderColor, etc.)
 * prefer `$tokenName` references from the tamagui-config themes.
 *
 * Use these constants only when raw hex/rgba is required in CSS strings
 * (gradients, box-shadows, transitions) or when a Tamagui token mapping
 * does not exist for a particular value.
 *
 * LS-8526: brand and position values are re-exported from
 * `@legacy-sports/design-tokens` — the single canonical source — instead of
 * being duplicated here. Do not re-declare `BRAND_*`/`POS_*` locally
 * elsewhere; import from here or from `@legacy-sports/design-tokens` directly.
 */

import {
  accentInk,
  baseballPositionBadges,
  brand,
  darkSurface,
  footballPositionBadges,
  getPositionColor as getPositionColorToken,
  ledger,
  lightenForContrast as lightenForContrastToken,
  positions,
  semantic,
  withAlpha as withAlphaToken,
} from '@legacy-sports/design-tokens';

// -- Utility --------------------------------------------------------

/** Convert a hex color to an rgba() string at the given alpha. */
export const withAlpha = withAlphaToken;

/** Lighten a color toward a WCAG contrast target against a background, in
 *  OKLab (hue/chroma-preserving) — see `@legacy-sports/design-tokens` for the
 *  implementation. Used to derive readable text variants of saturated accents
 *  (e.g. a position badge hue as chip/tile label text) without a second
 *  hand-picked hex per accent (LS-8832). */
export const lightenForContrast = lightenForContrastToken;

/** Dark ink for text on light accent fills (gold buttons, K/FLEX chips). */
export const ACCENT_INK = accentInk;

// -- Backgrounds & Surfaces ------------------------------------------

export const BG_DARK = darkSurface.bg;
export const SURFACE_SUBTLE = darkSurface.surfaceSubtle;
export const SURFACE_PANEL = darkSurface.surfacePanel;
export const SURFACE_CARD = darkSurface.surfaceCard;
export const OUTLINE_SUBTLE = darkSurface.outlineSubtle;
/** Mid dark-surface outline — inactive chip/pill borders (LS-8832). */
export const OUTLINE_DEFAULT = darkSurface.outlineDefault;
/** Strongest dark-surface outline — editorial button/rule borders on `$background`. */
export const OUTLINE_STRONG = darkSurface.outlineStrong;
export const PANEL_BORDER = darkSurface.panelBorder;

// -- Brand Heritage --------------------------------------------------

export const BRAND_NAVY = brand.navy;
export const BRAND_NAVY_LIGHT = brand.navyLight;
export const BRAND_NAVY_DARK = brand.navyDark;
export const BRAND_SEAM_RED = brand.seamRed;
export const BRAND_SEAM_RED_DARK = brand.seamRedDark;
export const BRAND_SEAM_RED_LIGHT = brand.seamRedLight;
export const BRAND_GOLD = brand.gold;
/** Press/active state for gold surfaces — no design-tokens equivalent yet. */
export const BRAND_GOLD_PRESS = '#A8894A';
export const BRAND_GOLD_LIGHT = brand.goldLight;
export const BRAND_GOLD_DARK = brand.goldDark;

// -- Field Green (affirmative accent) --------------------------------
// LS-8812: the ballpark-grass affirmative tone from the mobile join/browse
// handoff — valid invite-code states, spot meters, and OPEN badges. Distinct
// from the brighter `GREEN`/`semantic.success` UI-chrome green.

export const FIELD_GREEN = semantic.fieldGreen;
/** Field green lightened for legibility on dark strips. */
export const FIELD_GREEN_FG = semantic.fieldGreenFg;
export const FIELD_GREEN_SOFT = semantic.fieldGreenSoft;
export const FIELD_GREEN_BORDER = semantic.fieldGreenBorder;

/** Softer seam-red foreground for dark error strips. */
export const SEAM_ERROR_FG = semantic.seamErrorFg;
export const SEAM_ERROR_SOFT = semantic.seamErrorSoft;

// -- Position Colors -------------------------------------------------

/** Sport scope for position color lookups. Mirrors the `sport_kind` enum
 *  introduced by the sport-toggle initiative (ADR 0011). */
export type Sport = 'baseball' | 'football';

// Baseball position tokens (LS-8578: promoted from elite-draft's palette,
// the authoritative source per product decision) — unified into
// `@legacy-sports/design-tokens` `baseballPositionBadges` under LS-8526.
export const POS_CATCHER = baseballPositionBadges.C;
export const POS_FIRST_BASE = baseballPositionBadges['1B'];
export const POS_SECOND_BASE = baseballPositionBadges['2B'];
export const POS_THIRD_BASE = baseballPositionBadges['3B'];
export const POS_SHORTSTOP = baseballPositionBadges.SS;
export const POS_OUTFIELD = baseballPositionBadges.OF;
export const POS_PITCHER = baseballPositionBadges.P;
export const POS_STARTING_PITCHER = baseballPositionBadges.SP;
export const POS_RELIEF_PITCHER = baseballPositionBadges.RP;
export const POS_DESIGNATED_HITTER = baseballPositionBadges.DH;
export const POS_UTILITY = positions.utility;
/** Generic "infield" category color for position-group filters (e.g. an IF
 *  filter tab covering 1B/2B/3B/SS) — distinct from the per-position hex
 *  values in POSITION_COLORS, which vary per infield position. */
export const POS_INFIELD = positions.infield;

// Football position tokens — mirrors the football theme block in the
// Draft Board mockup (`draft.html` ~lines 2700–2846, ADR 0011 §3).
export const POS_QB = footballPositionBadges.QB;
export const POS_RB = footballPositionBadges.RB;
export const POS_WR = footballPositionBadges.WR;
export const POS_TE = footballPositionBadges.TE;
export const POS_K = footballPositionBadges.K;
/** Legacy/catch-all "DEF" position — distinct from DST (team defense unit);
 *  no per-position badge equivalent in the canonical table. */
export const POS_DEF = '#4A6FA5';
export const POS_FLEX = footballPositionBadges.FLEX;
// IDP defensive sub-position tokens — each visually distinct.
export const POS_DST = footballPositionBadges.DST;
export const POS_DL = footballPositionBadges.DL;
export const POS_LB = footballPositionBadges.LB;
export const POS_DB = footballPositionBadges.DB;

const FOOTBALL_POSITIONS_SHARED: Record<string, string> = {
  ...footballPositionBadges,
  DEF: POS_DEF,
};

export const POSITION_COLORS: Record<Sport, Record<string, string>> = {
  baseball: baseballPositionBadges,
  football: FOOTBALL_POSITIONS_SHARED,
};

export function getPositionColor(sport: Sport, position: string): string {
  return (
    POSITION_COLORS[sport][position] ?? getPositionColorToken(sport, position)
  );
}

// -- Text ------------------------------------------------------------

export const TEXT_HIGH_CONTRAST = '#F5F7FA';
export const TEXT_PRIMARY = '#F8FAFC';
export const TEXT_MUTED = '#9CAAC5';
/** Interface text — high-contrast on dark backgrounds (lighter than TEXT_PRIMARY). */
export const TEXT_INTERFACE = '#E8EDF5';
/** Secondary text — labels, subtitles, less-prominent content. */
export const TEXT_SECONDARY = '#8A9BB5';
/** Editorial-shell neutral foreground (FG3) — eyebrow/lede/meta text on dark
 * canvases. Shared across the Players/Stats redesign slices. */
export const TEXT_NEUTRAL_FG3 = '#9CAAC5';
/** Tertiary text — further muted, de-emphasized content. */
export const TEXT_TERTIARY = '#6C80BA';
/** Disabled foreground — unreachable wizard steps, unavailable chip options. */
export const TEXT_DISABLED = ledger.disabledFg;

// -- Ledger / wizard accents (LS-8809) --------------------------------

/** Muted ledger green — completed-step check marks. */
export const LEDGER_SUCCESS = ledger.successCheck;
/** Inline field-error rose — softer than STATUS_DANGER, for form validation. */
export const INLINE_ERROR = ledger.errorInline;

// -- Score / Status Colors ---------------------------------------------

/** Loss accent — score highlighting for losing matchup side. Matches
 *  `semantic.dangerFg` in design-tokens; kept as its own named export since
 *  callers reach for "loss"/"win" semantics rather than generic danger/success. */
export const SCORE_LOSS = '#E07A8C';
/** Win accent — score highlighting for the winning matchup side / positive
 *  trend indicators. */
export const SCORE_WIN = semantic.successFg;
/** Warm amber text — "coming soon" labels and soft warning states. */
export const AMBER_WARM = '#E3B870';

// -- Blues (primary accent / links) -----------------------------------

export const BLUE = '#3B82F6';
export const BLUE_LIGHT = '#60A5FA';
export const BLUE_LIGHTER = '#93C5FD';
export const BLUE_DEEP = '#2563EB';
export const BLUE_ALT = '#3366FF';

// -- Greens (success / outfield) --------------------------------------

export const GREEN = '#22C55E';
export const GREEN_LIGHT = '#4ADE80';
export const GREEN_LIGHTER = '#86EFAC';
export const GREEN_DEEP = '#16A34A';
export const EMERALD = '#059669';
export const EMERALD_DARK = '#047857';
export const EMERALD_LIGHT = '#10B981';
export const EMERALD_LIGHTER = '#34D399';

// -- Reds (error) ----------------------------------------------------

export const RED = '#DC2626';
export const RED_DARK = '#991B1B';

// -- Ambers & Golds (warning) ----------------------------------------

export const AMBER = '#F59E0B';
export const AMBER_LIGHT = '#FBBF24';
export const AMBER_DARK = '#D97706';
export const ORANGE = '#F97316';
export const YELLOW = '#EAB308';

// -- Slate / Muted ---------------------------------------------------

export const SLATE_500 = '#64748B';
export const SLATE_400 = '#94A3B8';
export const SLATE_300 = '#CBD5E1';
export const SLATE_100 = '#F1F5F9';
export const GRAY_50 = '#F9FAFB';

// -- Rank Badge Colors -----------------------------------------------

/** Silver medal tone for 2nd-place rank badges in standings tables. */
export const RANK_SILVER = '#A8A9AD';

// -- Neutrals --------------------------------------------------------

export const GRAY = '#6B7280';
export const GRAY_LIGHT = '#9CA3AF';
export const WHITE = '#FFFFFF';
export const BLACK = '#000000';

// -- Pre-built CSS Gradients -----------------------------------------
// LS-8526: brand-banned violet/purple/pink/indigo stops removed — see
// .agents/skills/ui/references/brand-colors.md "Never Do".

export const GRADIENT_ACCENT_GREEN = `linear-gradient(90deg, ${GREEN}, ${GREEN_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_NAVY = `linear-gradient(90deg, ${BRAND_NAVY}, ${BRAND_NAVY_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_AMBER = `linear-gradient(90deg, ${AMBER}, ${AMBER_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_GRAY = `linear-gradient(90deg, ${GRAY}, ${GRAY_LIGHT}, transparent)`;
export const GRADIENT_ACCENT_BRAND = `linear-gradient(90deg, ${BRAND_NAVY_LIGHT}, ${BRAND_GOLD_LIGHT}, transparent)`;

export const GRADIENT_BOARD_BG = `linear-gradient(135deg, ${BG_DARK} 0%, ${SURFACE_PANEL} 50%, ${BRAND_NAVY} 100%)`;
export const GRADIENT_SEAM_RED = `linear-gradient(135deg, ${BRAND_SEAM_RED} 0%, ${BRAND_SEAM_RED_DARK} 100%)`;
export const GRADIENT_ERROR = `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`;
export const GRADIENT_SUCCESS = `linear-gradient(135deg, ${EMERALD} 0%, ${EMERALD_DARK} 100%)`;
export const GRADIENT_WARNING = `linear-gradient(135deg, ${AMBER} 0%, ${AMBER_DARK} 100%)`;
export const GRADIENT_NAVY = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`;
export const GRADIENT_GOLD = `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_PRESS} 100%)`;
export const GRADIENT_WHITE_CARD = `linear-gradient(135deg, ${WHITE} 0%, ${SLATE_100} 100%)`;
export const GRADIENT_BUTTON_PRIMARY = `linear-gradient(135deg, ${BRAND_NAVY_LIGHT}, ${BRAND_NAVY})`;
export const GRADIENT_BUTTON_SAVE = `linear-gradient(135deg, ${BLUE}, ${BLUE_DEEP})`;
export const GRADIENT_AVATAR = `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_GOLD} 100%)`;

// -- Semi-transparent Overlays ----------------------------------------

export const OVERLAY_BLACK_30 = 'rgba(0, 0, 0, 0.3)';
export const OVERLAY_BLACK_40 = 'rgba(0, 0, 0, 0.4)';
export const OVERLAY_BLACK_50 = 'rgba(0, 0, 0, 0.5)';
export const OVERLAY_WHITE_05 = 'rgba(255, 255, 255, 0.05)';
export const OVERLAY_WHITE_10 = 'rgba(255, 255, 255, 0.1)';

// -- Status Colors ----------------------------------------------------

/** Danger/destructive accent — decline/cancel actions, error surfaces. */
export const STATUS_DANGER = '#EF4444';

// -- Ticket-stock hero card (LS-9034) ---------------------------------
// Design source: docs/design/nxFiEGqu3yPCDKpoNDmQWA/legacy-sports-homepage.
// Cream-stock "printed ticket" motif for the baseball home hero card — the
// one light surface on an otherwise dark-theme page. Dark-on-light text
// tokens scoped to that one card; do NOT reuse dark-theme text tokens here,
// and do NOT reuse these on any dark-surface component.

/** Ticket stock gradient — top stop. */
export const TICKET_STOCK = '#F4EEDC';
/** Ticket stock gradient — bottom stop. */
export const TICKET_STOCK_2 = '#E9E0C8';
/** Ticket primary ink (titles, leading team name). */
export const TICKET_INK = '#1B2536';
/** Ticket secondary ink (sub-copy, deadlines). */
export const TICKET_INK_SOFT = '#6E6A5C';
/** Ticket tertiary ink (trailing team name/score, "vs" divider). */
export const TICKET_INK_TRAIL = '#918A77';
/** Ticket dashed-rule / perforation color. */
export const TICKET_RULE = '#CFC3A6';

// -- Stats Page Brand Tokens (LS-4612) --------------------------------
// Design source: docs/design/qtqqKYxMFf1A8GY5NL9GNQ/legacy-sports-stats-page/
// project/ds/colors_and_type.css. Subsequent Stats Page slices
// (LS-4613/4614/4615/4616) consume these by name so the redesign stays
// consistent without re-importing the same literals. Values reuse the
// tokens above where possible — only STATS_BORDER is a new literal.

/** Stats Page border — design-spec shade between PANEL_BORDER and OUTLINE_SUBTLE. */
export const STATS_BORDER = '#1E2D45';

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
