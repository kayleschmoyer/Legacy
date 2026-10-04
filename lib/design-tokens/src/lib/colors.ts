export const brand = {
  navy: '#1B3A5C',
  navyLight: '#2C4A7C',
  navyDark: '#143050',
  seamRed: '#C41E3A',
  seamRedLight: '#E63950',
  seamRedDark: '#8B1A2B',
  gold: '#C5A55A',
  goldLight: '#D4BB78',
  goldDark: '#A68B3E',
} as const;

export const darkSurface = {
  bg: '#0A0F1A',
  bgHover: '#0E1624',
  bgPress: '#0B1220',
  surfaceSubtle: '#0D1526',
  surfacePanel: '#111B2F',
  surfaceCard: '#16223A',
  surfaceRaised: '#1C2A47',
  outlineSubtle: '#1C2740',
  outlineDefault: '#2F3B53',
  outlineStrong: '#4D5D80',
  panelBorder: '#1F2D48',
} as const;

export const darkText = {
  fg1: '#F8FAFC',
  fg1Strong: '#FFFFFF',
  fg2: '#DEE6FF',
  fg3: '#9CAAC5',
  // LS-10452: was #6C80BA (3.69:1 on surfaceRaised). Every text tier must
  // clear WCAG AA (4.5:1) on every surface — enforced in colors.spec.ts.
  fg4: '#8296CA',
  fgOnAccent: '#F8FAFC',
} as const;

export const lightSurface = {
  bg: '#FFFFFF',
  bgHover: '#F8FAFC',
  bgPress: '#F2F4F8',
  surfaceSubtle: '#EDF1F7',
  surfacePanel: '#EFF4FB',
  surfaceCard: '#F5F7FA',
  surfaceRaised: '#FFFFFF',
  outlineSubtle: '#E1E7F0',
  outlineDefault: '#CBD5E1',
  outlineStrong: '#7F90AE',
  panelBorder: '#D0DAE8',
} as const;

export const lightText = {
  fg1: '#0B1220',
  fg1Strong: '#000000',
  fg2: '#1F2937',
  fg3: '#4A6080',
  // LS-10452: was #7D8EAD (2.92:1 on surfaceSubtle).
  fg4: '#606D85',
  // Accent surfaces (navy/gold/red) are dark in both themes, so the
  // foreground on them stays the dark-theme value — the source bundle
  // intentionally does not override --fg-on-accent in `.theme-light`.
  fgOnAccent: '#F8FAFC',
} as const;

export const semantic = {
  success: '#4AAE7C',
  successFg: '#6FD39A',
  successSoft: 'rgba(34, 110, 74, 0.22)',
  successBorder: 'rgba(34, 110, 74, 0.55)',
  warning: '#C89452',
  warningFg: '#E3B870',
  warningSoft: 'rgba(176, 118, 38, 0.22)',
  warningBorder: 'rgba(176, 118, 38, 0.55)',
  danger: '#C23E54',
  dangerFg: '#E07A8C',
  dangerSoft: 'rgba(176, 46, 68, 0.22)',
  dangerBorder: 'rgba(176, 46, 68, 0.55)',
  info: '#5B84C4',
  infoFg: '#8FB4E8',
  infoSoft: 'rgba(70, 110, 176, 0.22)',
  infoBorder: 'rgba(70, 110, 176, 0.55)',
  focusRing: '#4E8ED6',
  // Status-badge-only variants (no numeric "base" — bg/fg/border triplets
  // matching the successFg/successSoft/successBorder pattern above).
  neutralFg: '#9CAAC5',
  neutralSoft: 'rgba(127, 144, 174, 0.12)',
  neutralBorder: '#2F3B53',
  accentFg: '#D4BB78',
  accentSoft: 'rgba(197, 165, 90, 0.12)',
  accentBorder: 'rgba(197, 165, 90, 0.4)',
  // "Field green" affirmative accent (LS-8812) — the ballpark-grass tone the
  // mobile join/browse handoff uses for valid states and spot meters. Distinct
  // from `success` above, which is the brighter UI-chrome green used by toasts
  // and status badges; do not collapse the two.
  fieldGreen: '#7BA05B',
  fieldGreenFg: '#9DC183',
  fieldGreenSoft: 'rgba(123, 160, 91, 0.12)',
  fieldGreenBorder: 'rgba(123, 160, 91, 0.5)',
  // Seam-red error pairing for dark strips (LS-8812). `seamErrorFg` is a
  // softer read of `brand.seamRed` than `dangerFg`, tuned for the invite-code
  // "INVALID CODE" strip.
  seamErrorFg: '#E06A7C',
  seamErrorSoft: 'rgba(196, 30, 58, 0.12)',
} as const;

// Accents introduced by the mobile design-handoff batch (LS-8794/8795/8800/
// 8809) that have no equivalent in `semantic`: a muted ledger green for the
// completed-step check, a softer rose for inline field errors, and a dimmed
// foreground for disabled wizard steps and unavailable chip options.
export const ledger = {
  disabledFg: '#3E4E71',
  successCheck: '#7BA05B',
  errorInline: '#E06A7C',
} as const;

export const positions = {
  pitcher: '#C41E3A',
  catcher: '#7C8794',
  infield: '#8B6F47',
  outfield: '#2D6A4F',
  utility: '#C5A55A',
} as const;

// Roster-list position badge accents (players.tsx, PlayersScreen, elite-draft,
// PositionBadge, ...) — the authoritative per-position palette (LS-8578:
// promoted from elite-draft's palette by product decision), distinct from the
// `positions` panel-category accents above. Same value in both themes.
// LS-8526: unified here as the single source — web, shared-components, and
// native all previously carried independently-drifted copies of this table.
export const baseballPositionBadges = {
  P: '#4A708B', // steel blue
  C: '#C41E3A', // seam red
  '1B': '#B5651D', // warm amber
  '2B': '#C5A55A', // heritage gold
  '3B': '#2D6A4F', // forest green
  SS: '#2C4A7C', // navy light
  OF: '#64748B', // slate
  DH: '#8B2635', // burgundy
  RP: '#2E7D6E', // forest teal
  SP: '#4A708B', // steel blue
} as const;

export const footballPositionBadges = {
  QB: '#C41E3A', // seam red
  RB: '#8B6F47', // dirt brown
  WR: '#2D6A4F', // turf green
  TE: '#7C8794', // steel
  FLEX: '#C49A6C', // muted gold
  K: '#C5A55A', // heritage gold
  DST: '#C41E3A', // seam red (team defense unit)
  DL: '#C25A2A', // burnt orange-red (defensive line)
  LB: '#9B7A3D', // amber-brown (linebackers)
  DB: '#1B3A5C', // brand navy (defensive backs) — was purple #6B3FA0, LS-8526
  SFLEX: '#D4AF37', // gold variant — any-position flex (Superflex, premium slot — LS-6337)
  IDP: '#5B7FA6', // steel blue — individual defensive player umbrella
} as const;

/** Resolve a per-position badge accent; falls back to `positions.utility`. */
export function getPositionColor(
  sport: 'baseball' | 'football',
  position: string,
): string {
  const table: Record<string, string> =
    sport === 'baseball' ? baseballPositionBadges : footballPositionBadges;
  return table[position] ?? positions.utility;
}

// Light-theme position colors are desaturated for AA contrast on white
// surfaces (mirrors the brandGoldOverride pattern below for `utility`).
export const positionsLight = {
  pitcher: '#C41E3A',
  catcher: '#5A6670',
  infield: '#7C5B3D',
  outfield: '#2D6A4F',
  utility: '#B8942B',
} as const;

// Base RGB triple (as a hex string) that `tamagui-config`'s shadowColor*
// tokens are alpha-blended from — kept separate from `shadows.ts`'s
// pre-composed rgba() strings since tamagui-config needs distinct alpha
// steps (hover/press/focus) derived from the same base.
export const shadowBase = {
  dark: '#080C14',
  light: '#020617',
} as const;

/** Convert a `#rrggbb` hex color to an `rgba(r, g, b, alpha)` string. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// -- Contrast-derived variants ---------------------------------------
// Several dark-chrome surfaces need a *lightened* variant of an existing token
// (e.g. a position badge color used as label text on `darkSurface.bg`, where
// the badge hue itself is far too dark to read). Deriving those variants here
// keeps them out of call sites as new hex literals — the palette above stays
// the only place a color is spelled out. LS-8832.

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/**
 * WCAG 2.1 relative luminance of a `#rrggbb` color, in `[0, 1]`.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const linearize = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.1 contrast ratio between two `#rrggbb` colors, in `[1, 21]`.
 * Order-independent. https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Default contrast target for derived text variants — WCAG AAA for body text,
 *  which the design's 11px uppercase labels need to stay legible on dark. */
export const DERIVED_TEXT_CONTRAST_TARGET = 7;

// sRGB <-> OKLab (Björn Ottosson's published matrices). Lightening in OKLab
// rather than mixing toward white preserves the hue and chroma of a saturated
// accent, which is what the design handoff asks for ("compute via oklch
// lighten") — a plain white mix desaturates the badge hue into grey.

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = Math.max(c, 0);
  return (
    255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
  );
}

function hexToOklab(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([lightness, a, b]: Rgb): string {
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  return rgbToHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/**
 * Raise `color`'s OKLab lightness by the smallest amount that clears
 * `targetRatio` contrast against `background`, keeping its hue and chroma.
 *
 * Used to derive a readable text variant of a saturated accent (e.g. a position
 * badge hue used as a chip label on `darkSurface.bg`) without hand-picking a
 * second hex per position. Returns `color` unchanged when it already clears the
 * target. Contrast is always measured on the final 8-bit hex, so a value pushed
 * outside the sRGB gamut is judged after clamping, not before.
 */
export function lightenForContrast(
  color: string,
  background: string,
  targetRatio: number = DERIVED_TEXT_CONTRAST_TARGET,
): string {
  if (contrastRatio(color, background) >= targetRatio) return color;

  const [lightness, a, b] = hexToOklab(color);
  const at = (l: number): string => oklabToHex([l, a, b]);
  if (contrastRatio(at(1), background) < targetRatio) return at(1);

  // Contrast against a dark background rises monotonically with lightness, so
  // 20 bisections resolve to far under one 8-bit channel step — the result is
  // stable and snapshot-safe.
  let low = lightness;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (contrastRatio(at(mid), background) >= targetRatio) high = mid;
    else low = mid;
  }
  return at(high);
}

// Values `tamagui-config`'s brand themes need that have no equivalent
// semantic name elsewhere in this module — kept here (rather than inline in
// tamagui-config) so every hex/rgba literal in the theme still has a single
// source of truth.
export const chromeDark = {
  backgroundFocus: '#13203A',
  backgroundStrong: '#17253F',
  color5: '#243357',
  color6: '#2E3F6B',
  color7: '#394B7E',
  color8: '#475B95',
  color9: '#5B6FA8',
  color12: '#F5F7FA',
  colorPress: '#E2E8F0',
  borderColorHover: '#3A4866',
  borderColorPress: '#263043',
  successMuted: 'rgba(34, 197, 94, 0.18)',
  warningMuted: 'rgba(245, 158, 11, 0.18)',
  sportFootballPrimary: '#16A34A',
  sportFootballSecondary: '#F59E0B',
  focusRing: '#60A5FA',
} as const;

export const chromeLight = {
  backgroundFocus: '#E8F0FF',
  backgroundStrong: '#E6EAF2',
  color3: '#E4EAF2',
  color4: '#D9E1EC',
  color5: '#D5DDE8',
  color6: '#C3CDDA',
  color7: '#9CAAC5',
  color9: '#5F7295',
  color10: '#4A5B82',
  colorHover: '#111827',
  outlineStrong: '#C3CDDA',
  borderColorHover: '#B7C3D4',
  borderColorPress: '#9EABC1',
  successMuted: 'rgba(34, 197, 94, 0.12)',
  warningMuted: 'rgba(245, 158, 11, 0.14)',
  sportFootballPrimary: '#16A34A',
  sportFootballSecondary: '#F59E0B',
  focusRing: '#2563EB',
} as const;

// The 12-step Tailwind-style ramps `@tamagui/config` expects for its base
// $blue/$green/$red/$amber tokens. Brand-tuned so any internal Tamagui
// component still relying on them (directly using these tokens in app code
// is banned — see .agents/skills/ui/references/brand-colors.md) stays on
// brand rather than falling back to generic Tailwind blue.
export const scaleDark = {
  blue1: '#0A1A37',
  blue2: '#0E2652',
  blue3: '#12316B',
  blue4: '#173B83',
  blue5: '#1C479C',
  blue6: '#2156B6',
  blue7: '#2869D1',
  blue8: '#2F7FEC',
  blue9: '#3B82F6',
  blue10: '#60A5FA',
  blue11: '#93C5FD',
  blue12: '#EAF2FF',
  green1: '#072915',
  green2: '#0C3A20',
  green3: '#104B2A',
  green4: '#145C34',
  green5: '#166A3B',
  green6: '#178143',
  green7: '#199A4C',
  green8: '#22C55E',
  green9: '#4ADE80',
  green10: '#86EFAC',
  green11: '#BBF7D0',
  green12: '#ECFDF5',
  red1: '#3A0A12',
  red2: '#5C121B',
  red3: '#7F1D1D',
  red4: '#991B1B',
  red5: '#B91C1C',
  red8: '#F87171',
  red9: '#FCA5A5',
  red10: '#FECACA',
  red11: '#FEE2E2',
  red12: '#FEF2F2',
  amber1: '#2A1805',
  amber2: '#3B2107',
  amber3: '#4A2A09',
  amber4: '#5A330B',
  amber5: '#6B3D0E',
  amber6: '#8C4E12',
  amber7: '#B35F15',
  amber8: '#D97706',
  amber9: '#F59E0B',
  amber10: '#FBBF24',
  amber11: '#FDE68A',
  amber12: '#FEF3C7',
} as const;

export const scaleLight = {
  blue1: '#EFF6FF',
  blue2: '#DBEAFE',
  blue3: '#C7DBFD',
  blue4: '#9DC3FB',
  blue5: '#74A9F7',
  blue6: '#4F8EF4',
  blue7: '#2F73EC',
  blue8: '#2563EB',
  blue9: '#1D4ED8',
  blue10: '#1E40AF',
  blue11: '#1E3A8A',
  green1: '#ECFDF5',
  green2: '#D1FAE5',
  green3: '#A7F3D0',
  green4: '#6EE7B7',
  green5: '#34D399',
  green6: '#22C55E',
  green7: '#16A34A',
  green8: '#15803D',
  green9: '#166534',
  green10: '#14532D',
  green11: '#0F3C22',
  green12: '#072315',
  red1: '#FEF2F2',
  red2: '#FEE2E2',
  red3: '#FECACA',
  red4: '#FCA5A5',
  red5: '#F87171',
  red8: '#B91C1C',
  red9: '#991B1B',
  red10: '#7F1D1D',
  red11: '#5C121B',
  red12: '#3A0A12',
  amber1: '#FFFBEB',
  amber2: '#FEF3C7',
  amber3: '#FDE68A',
  amber4: '#FCD34D',
  amber5: '#FBBF24',
  amber6: '#F59E0B',
  amber7: '#D97706',
  amber8: '#B45309',
  amber9: '#92400E',
  amber10: '#78350F',
  amber11: '#4A250A',
  amber12: '#2A1805',
} as const;

export const glassDark = {
  surface: 'rgba(10, 15, 26, 0.75)',
  surfaceLight: 'rgba(10, 15, 26, 0.55)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.14)',
} as const;

export const glassLight = {
  surface: 'rgba(255, 255, 255, 0.75)',
  surfaceLight: 'rgba(255, 255, 255, 0.55)',
  border: 'rgba(0, 0, 0, 0.06)',
  borderHover: 'rgba(0, 0, 0, 0.12)',
} as const;

/**
 * Full-screen modal backdrop scrim. Deliberately theme-invariant — a modal
 * backdrop dims the content behind it the same way regardless of light/dark
 * theme, unlike UI surface colors — so it's a flat constant rather than a
 * dark/light pair.
 */
export const modalScrim = 'rgba(0, 0, 0, 0.8)';

/**
 * Dark ink for text set on light accent fills (heritage-gold buttons and
 * K/FLEX position chips). Matches the league-detail-v2 stylesheet's
 * `.ls-btn-gold` / `.ls-pchip` ink; theme-invariant like the accent fills
 * it sits on (LS-9355).
 */
export const accentInk = '#151515';

export const colors = {
  brand,
  positions,
  semantic,
  dark: {
    surface: darkSurface,
    text: darkText,
    glass: glassDark,
  },
  light: {
    surface: lightSurface,
    text: lightText,
    glass: glassLight,
    // Light-theme gold is desaturated for AA contrast on white surfaces.
    brandGoldOverride: {
      gold: '#B8942B',
      goldLight: '#D4B24A',
      goldDark: '#967828',
    },
  },
} as const;
