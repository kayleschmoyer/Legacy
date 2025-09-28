import { config } from '@tamagui/config';
import { createTamagui, type TamaguiConfig } from 'tamagui';

// Custom theme tokens for Legacy Sports
const legacySportsTheme = {
  // Background colors
  background: '#0f0f23',
  backgroundHover: '#1a1a2e',
  backgroundPress: '#16213e',
  backgroundFocus: '#1e1e3f',
  backgroundStrong: '#2a2a4a',
  backgroundTransparent: 'rgba(15, 15, 35, 0.8)',

  // Card and surface colors
  color1: '#0f0f23',
  color2: '#1a1a2e',
  color3: '#16213e',
  color4: '#1e1e3f',
  color5: '#2a2a4a',
  color6: '#3a3a5a',
  color7: '#4a4a6a',
  color8: '#5a5a7a',
  color9: '#6a6a8a',
  color10: '#7a7a9a',
  color11: '#9a9aaa',
  color12: '#bababaa',

  // Text colors
  color: '#ffffff',
  colorHover: '#f0f0f0',
  colorPress: '#e0e0e0',
  colorFocus: '#f5f5f5',
  colorTransparent: 'rgba(255, 255, 255, 0.8)',

  // Border colors
  borderColor: '#3a3a5a',
  borderColorHover: '#4a4a6a',
  borderColorPress: '#2a2a4a',
  borderColorFocus: '#5a5a7a',

  // Shadow colors
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowColorHover: 'rgba(0, 0, 0, 0.6)',
  shadowColorPress: 'rgba(0, 0, 0, 0.4)',
  shadowColorFocus: 'rgba(0, 0, 0, 0.7)',

  // Accent colors - Blues
  blue1: '#0c1b3d',
  blue2: '#1a2f5a',
  blue3: '#284377',
  blue4: '#365794',
  blue5: '#446bb1',
  blue6: '#5280ce',
  blue7: '#6094eb',
  blue8: '#7dabf8',
  blue9: '#9bc2ff',
  blue10: '#b8d9ff',
  blue11: '#d5f0ff',
  blue12: '#f2fbff',

  // Accent colors - Greens (for success states)
  green1: '#0d2818',
  green2: '#1a5030',
  green3: '#277848',
  green4: '#34a060',
  green5: '#41c878',
  green6: '#4ef090',
  green7: '#6bf5a8',
  green8: '#88fac0',
  green9: '#a5ffd8',
  green10: '#c2ffef',
  green11: '#e0fff7',
  green12: '#f0fffc',

  // Accent colors - Reds (for error states)
  red1: '#2d0c18',
  red2: '#5a1930',
  red3: '#872648',
  red4: '#b43360',
  red5: '#e14078',
  red6: '#f54d90',
  red7: '#ff6ba8',
  red8: '#ff88c0',
  red9: '#ffa5d8',
  red10: '#ffc2ef',
  red11: '#ffe0f7',
  red12: '#fff0fc',

  // Accent colors - Purples (for secondary actions)
  purple1: '#1a0d2d',
  purple2: '#341a5a',
  purple3: '#4e2787',
  purple4: '#6834b4',
  purple5: '#8241e1',
  purple6: '#9c4ef5',
  purple7: '#b66bff',
  purple8: '#d088ff',
  purple9: '#eaa5ff',
  purple10: '#f4c2ff',
  purple11: '#fde0ff',
  purple12: '#fef0ff',
};

// Custom configuration extending the base config
const customConfig = {
  ...config,
  themes: {
    ...config.themes,
    // Override the dark theme with our custom theme
    dark: legacySportsTheme,
    // Set dark as the default theme
    light: legacySportsTheme, // Use dark theme for light mode too for consistency
    // Create branded themes
    legacy_dark: legacySportsTheme,
    legacy: legacySportsTheme,
  },
  settings: {
    ...config.settings,
    // Default to dark theme
    defaultTheme: 'dark',
  },
};

// Shared Tamagui configuration for all applications in the workspace
// This ensures consistency in design tokens, themes, and components across
// web, mobile, and any other platforms using Tamagui

// Create and export the Tamagui configuration
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const tamaguiConfig: TamaguiConfig = createTamagui(customConfig);

export default tamaguiConfig;
