import { createAnimations } from '@tamagui/animations-react-native';
import { config } from '@tamagui/config';
import { createTamagui } from 'tamagui';

// Legacy Sports — Heritage-meets-modern brand themes
// Identity: "Night stadium" dark with vintage sport character
// Baseball: deep navy + seam red + aged gold
// Football: turf green + amber
// Typography: serif headings (Playfair Display) + clean body (Inter) + tabular mono
// Keep existing token names for full compatibility; ensure AA contrast

const brandDark = {
  // Backgrounds — unified deep navy (single source of truth)
  background: '#0A0F1A', // deep navy/charcoal
  backgroundHover: '#0E1624',
  backgroundPress: '#0B1220',
  backgroundFocus: '#13203A',
  backgroundStrong: '#17253F',
  backgroundTransparent: 'rgba(10, 15, 26, 0.85)',

  // Surfaces (elevations)
  color1: '#0D1526',
  color2: '#111B2F',
  color3: '#16223A',
  color4: '#1C2A47',
  color5: '#243357',
  color6: '#2E3F6B',
  color7: '#394B7E',
  color8: '#475B95',
  color9: '#5B6FA8',
  color10: '#6C80BA',
  color11: '#DEE6FF', // subtle text on dark surfaces
  color12: '#F5F7FA', // high contrast text

  // Extended surfaces for dashboards & roster layouts
  surfacePanel: '#111B2F',
  surfacePanelBorder: '#1F2D48',
  surfaceCard: '#16223A',
  surfaceSubtle: '#0D1526',
  surfaceInteractive: 'rgba(27, 58, 92, 0.22)',
  accentMuted: 'rgba(27, 58, 92, 0.30)',
  successMuted: 'rgba(34, 197, 94, 0.18)',
  warningMuted: 'rgba(245, 158, 11, 0.18)',
  outlineSubtle: '#1C2740',
  outlineStrong: '#2F3B53',
  textMuted: '#9CAAC5',
  textOnAccent: '#F8FAFC',

  // Glass surface tokens — for glassmorphism overlays & cards
  glassSurface: 'rgba(10, 15, 26, 0.75)',
  glassSurfaceLight: 'rgba(10, 15, 26, 0.55)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBorderHover: 'rgba(255, 255, 255, 0.14)',
  glassTextSubdued: 'rgba(248, 250, 252, 0.65)',
  glassTextMuted: 'rgba(248, 250, 252, 0.45)',

  // Semi-transparent background — used for glassmorphism sticky headers
  // e.g. `backgroundColor: '$background075'` with `backdropFilter: 'blur(...)'`
  background075: 'rgba(10, 15, 26, 0.75)',

  // Heritage brand accents
  brandNavy: '#1B3A5C', // deep baseball navy
  brandNavyLight: '#2C4A7C', // lighter navy for gradients
  brandSeamRed: '#C41E3A', // baseball seam red
  brandSeamRedLight: '#E63950', // lighter seam red for hover/glow
  brandGold: '#C5A55A', // aged gold — trophies, pennants, vintage borders
  brandGoldLight: '#D4BB78', // lighter gold for hover
  brandGoldDark: '#A68B3E', // darker gold for press states

  // Text
  color: '#F8FAFC',
  colorHover: '#FFFFFF',
  colorPress: '#E2E8F0',
  colorFocus: '#FFFFFF',
  colorTransparent: 'rgba(248, 250, 252, 0.85)',

  // Borders
  borderColor: '#2F3B53',
  borderColorHover: '#3A4866',
  borderColorPress: '#263043',
  borderColorFocus: '#4D5D80',

  // Shadows
  shadowColor: 'rgba(8, 12, 20, 0.6)',
  shadowColorHover: 'rgba(8, 12, 20, 0.7)',
  shadowColorPress: 'rgba(8, 12, 20, 0.5)',
  shadowColorFocus: 'rgba(8, 12, 20, 0.8)',

  // Primary (deep navy blue — brand-shifted from generic Tailwind blue)
  blue1: '#0A1A37',
  blue2: '#0E2652',
  blue3: '#12316B',
  blue4: '#173B83',
  blue5: '#1C479C',
  blue6: '#2156B6',
  blue7: '#2869D1',
  blue8: '#2F7FEC',
  blue9: '#3B82F6', // links/focus
  blue10: '#60A5FA',
  blue11: '#93C5FD',
  blue12: '#EAF2FF',

  // Success
  green1: '#072915',
  green2: '#0C3A20',
  green3: '#104B2A',
  green4: '#145C34',
  green5: '#166A3B',
  green6: '#178143',
  green7: '#199A4C', // turf
  green8: '#22C55E', // success base
  green9: '#4ADE80',
  green10: '#86EFAC',
  green11: '#BBF7D0',
  green12: '#ECFDF5',

  // Error — seam-red-adjacent
  red1: '#3A0A12',
  red2: '#5C121B',
  red3: '#7F1D1D',
  red4: '#991B1B',
  red5: '#B91C1C',
  red6: '#C41E3A', // seam red (heritage)
  red7: '#E63950',
  red8: '#F87171',
  red9: '#FCA5A5',
  red10: '#FECACA',
  red11: '#FEE2E2',
  red12: '#FEF2F2',

  // Secondary (amber / gold) — football UI hints + heritage gold
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

  // Sport-specific accents (semantic helpers)
  sportBaseballPrimary: '#1B3A5C', // deep navy
  sportBaseballSecondary: '#C41E3A', // seam red
  sportFootballPrimary: '#16A34A', // turf green
  sportFootballSecondary: '#F59E0B', // amber

  // Position colors — baseball-themed
  positionPitcher: '#C41E3A', // seam red — the baseball itself
  positionCatcher: '#7C8794', // steel gray — catcher's gear
  positionInfield: '#8B6F47', // warm brown — infield dirt
  positionOutfield: '#2D6A4F', // field green — outfield grass
  positionUtility: '#C5A55A', // aged gold — versatility/trophy

  focusRing: '#60A5FA',
};

const brandLight = {
  // Backgrounds (neutral warm gray)
  background: '#FFFFFF',
  backgroundHover: '#F8FAFC',
  backgroundPress: '#F2F4F8',
  backgroundFocus: '#E8F0FF',
  backgroundStrong: '#E6EAF2',
  backgroundTransparent: 'rgba(255, 255, 255, 0.85)',

  // Surfaces
  color1: '#FFFFFF',
  color2: '#F7FAFC',
  color3: '#EFF3F8',
  color4: '#E6EBF2',
  color5: '#D5DDE8',
  color6: '#C3CDDA',
  color7: '#9CAAC5',
  color8: '#7D8EAD',
  color9: '#5F7295',
  color10: '#4A5B82',
  color11: '#1F2937', // main text
  color12: '#0B1220', // strongest text

  // Extended surfaces for dashboards & roster layouts
  surfacePanel: '#F7FAFF',
  surfacePanelBorder: '#D0DAE8',
  surfaceCard: '#FFFFFF',
  surfaceSubtle: '#EFF3F8',
  surfaceInteractive: 'rgba(27, 58, 92, 0.06)',
  accentMuted: 'rgba(27, 58, 92, 0.10)',
  successMuted: 'rgba(34, 197, 94, 0.12)',
  warningMuted: 'rgba(245, 158, 11, 0.14)',
  outlineSubtle: '#E1E7F0',
  outlineStrong: '#C3CDDA',
  textMuted: '#5F7295',
  textOnAccent: '#FFFFFF',

  // Glass surface tokens — for glassmorphism overlays & cards
  glassSurface: 'rgba(255, 255, 255, 0.75)',
  glassSurfaceLight: 'rgba(255, 255, 255, 0.55)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  glassBorderHover: 'rgba(0, 0, 0, 0.12)',
  glassTextSubdued: 'rgba(11, 18, 32, 0.65)',
  glassTextMuted: 'rgba(11, 18, 32, 0.45)',

  // Semi-transparent background — used for glassmorphism sticky headers
  // e.g. `backgroundColor: '$background075'` with `backdropFilter: 'blur(...)'`
  background075: 'rgba(255, 255, 255, 0.75)',

  // Heritage brand accents
  brandNavy: '#1B3A5C',
  brandNavyLight: '#2C4A7C',
  brandSeamRed: '#C41E3A',
  brandSeamRedLight: '#E63950',
  brandGold: '#A68B3E',
  brandGoldLight: '#C5A55A',
  brandGoldDark: '#8A7232',

  // Text
  color: '#0B1220',
  colorHover: '#111827',
  colorPress: '#1F2937',
  colorFocus: '#0B1220',
  colorTransparent: 'rgba(11, 18, 32, 0.85)',

  // Borders
  borderColor: '#CBD5E1',
  borderColorHover: '#B7C3D4',
  borderColorPress: '#9EABC1',
  borderColorFocus: '#7F90AE',

  // Shadows
  shadowColor: 'rgba(2, 6, 23, 0.12)',
  shadowColorHover: 'rgba(2, 6, 23, 0.18)',
  shadowColorPress: 'rgba(2, 6, 23, 0.08)',
  shadowColorFocus: 'rgba(2, 6, 23, 0.22)',

  // Primary (blue)
  blue1: '#EFF6FF',
  blue2: '#DBEAFE',
  blue3: '#C7DBFD',
  blue4: '#9DC3FB',
  blue5: '#74A9F7',
  blue6: '#4F8EF4',
  blue7: '#2F73EC',
  blue8: '#2563EB',
  blue9: '#1D4ED8', // brand link
  blue10: '#1E40AF',
  blue11: '#1E3A8A',
  blue12: '#0B1220',

  // Success
  green1: '#ECFDF5',
  green2: '#D1FAE5',
  green3: '#A7F3D0',
  green4: '#6EE7B7',
  green5: '#34D399',
  green6: '#22C55E',
  green7: '#16A34A', // turf
  green8: '#15803D',
  green9: '#166534',
  green10: '#14532D',
  green11: '#0F3C22',
  green12: '#072315',

  // Error — seam-red-adjacent
  red1: '#FEF2F2',
  red2: '#FEE2E2',
  red3: '#FECACA',
  red4: '#FCA5A5',
  red5: '#F87171',
  red6: '#E63950', // seam red (heritage)
  red7: '#C41E3A',
  red8: '#B91C1C',
  red9: '#991B1B',
  red10: '#7F1D1D',
  red11: '#5C121B',
  red12: '#3A0A12',

  // Secondary (amber / gold) — football UI hints + heritage gold
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

  // Sport-specific accents (semantic helpers)
  sportBaseballPrimary: '#1B3A5C', // deep navy
  sportBaseballSecondary: '#C41E3A', // seam red
  sportFootballPrimary: '#16A34A', // turf green
  sportFootballSecondary: '#F59E0B', // amber

  // Position colors — baseball-themed
  positionPitcher: '#C41E3A', // seam red
  positionCatcher: '#5A6670', // steel gray
  positionInfield: '#7C5B3D', // warm brown — dirt
  positionOutfield: '#2D6A4F', // field green
  positionUtility: '#A68B3E', // aged gold

  focusRing: '#2563EB',
};

// Custom configuration extending the base config
// Extract the base animation definitions from @tamagui/config.
// config.animations may be:
//   1. A driver object: { animations: Record<string, ...>, useAnimations, ... }
//   2. A plain map: Record<string, AnimationDef>
// We handle both shapes to survive Tamagui version changes.
const rawAnimations = config.animations as
  | { animations?: Record<string, unknown> }
  | Record<string, unknown>
  | undefined;

const baseAnimationDefs = ((rawAnimations &&
  'animations' in rawAnimations &&
  typeof rawAnimations.animations === 'object' &&
  rawAnimations.animations) ||
  {}) as Record<string, Record<string, unknown>>;

const animations = createAnimations({
  ...baseAnimationDefs,
  // Enumerate critical animation presets explicitly so they are guaranteed
  // even if baseAnimationDefs extraction silently returns {} on a future
  // Tamagui upgrade. These override base defs with identical values.
  '100ms': {
    type: 'timing' as const,
    duration: 100,
  },
  '75ms': {
    type: 'timing' as const,
    duration: 75,
  },
  '200ms': {
    type: 'timing' as const,
    duration: 200,
  },
  bouncy: {
    type: 'spring' as const,
    damping: 9,
    mass: 0.9,
    stiffness: 150,
  },
  lazy: {
    type: 'spring' as const,
    damping: 18,
    stiffness: 50,
  },
  medium: {
    type: 'spring' as const,
    damping: 15,
    mass: 1,
    stiffness: 120,
  },
  slow: {
    type: 'spring' as const,
    damping: 15,
    stiffness: 40,
  },
  // quick — used by JoinLeagueByCodePage buttons
  quick: {
    type: 'spring' as const,
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  tooltip: {
    type: 'spring' as const,
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  superBouncy: {
    type: 'spring' as const,
    damping: 5,
    mass: 0.7,
    stiffness: 200,
  },
  slowest: {
    type: 'spring' as const,
    damping: 15,
    stiffness: 10,
  },
  quicker: {
    type: 'spring' as const,
    damping: 20,
    mass: 1,
    stiffness: 250,
  },
  quickest: {
    type: 'spring' as const,
    damping: 14,
    mass: 0.1,
    stiffness: 380,
  },
  // "fast" — used by PricingPage toggle/FAQ; not in @tamagui/config defaults
  fast: {
    type: 'timing' as const,
    duration: 150,
  },
});

const customConfig = {
  ...config,
  animations,
  themes: {
    ...config.themes,
    // Branded themes
    dark: brandDark,
    light: brandLight,
    legacy_dark: brandDark,
    legacy: brandLight,
  },
  settings: {
    ...config.settings,
    // Follow system preference by default; fall back to light
    defaultTheme: 'light',
  },
};

// Shared Tamagui configuration for all applications in the workspace
// This ensures consistency in design tokens, themes, and components across
// web, mobile, and any other platforms using Tamagui

// Create and export the Tamagui configuration
export const tamaguiConfig = createTamagui(customConfig);

export default tamaguiConfig;
