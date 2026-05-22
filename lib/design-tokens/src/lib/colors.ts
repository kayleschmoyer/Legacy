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
} as const;

export const positions = {
  pitcher: '#C41E3A',
  catcher: '#7C8794',
  infield: '#8B6F47',
  outfield: '#2D6A4F',
  utility: '#C5A55A',
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
