import type { TamaguiInternalConfig } from 'tamagui';

// Simple mock config to satisfy TypeScript requirements
// Using any cast since we're dealing with complex Tamagui type requirements
const tamaguiConfig = {
  themes: {
    light: {
      background: '#ffffff',
      color: '#000000',
    },
    dark: {
      background: '#000000', 
      color: '#ffffff',
    },
  },
  tokens: {
    space: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      true: 16,
    },
    size: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      true: 16,
    },
    color: {
      white: '#ffffff',
      black: '#000000',
      blue: '#3366FF',
    },
  },
  fonts: {
    body: {
      family: 'Inter, system-ui, sans-serif',
      size: {
        1: 11,
        2: 12,
        3: 13,
        4: 14,
        true: 14,
      },
    },
  },
  shorthands: {},
  media: {},
  animations: {},
  settings: {},
  fontLanguages: ['en'],
} as unknown as TamaguiInternalConfig;

export default tamaguiConfig;
