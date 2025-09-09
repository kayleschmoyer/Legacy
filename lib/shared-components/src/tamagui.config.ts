import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from '@tamagui/core';

const config = createTamagui({
  ...defaultConfig,
  // Override any specific settings if needed
  settings: {
    ...defaultConfig.settings,
    // Recommended for React Native compatibility
    styleCompat: 'react-native',
  },
  themes: {
    ...defaultConfig.themes,
    // Add custom themes if needed
  },
  tokens: {
    ...defaultConfig.tokens,
    // Add custom tokens if needed
  },
});

export default config;
