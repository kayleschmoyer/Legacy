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
  fg4: '#6C80BA',
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
  fg4: '#7D8EAD',
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
  SUPERFLEX: '#D4AF37', // gold variant — any-position flex
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
