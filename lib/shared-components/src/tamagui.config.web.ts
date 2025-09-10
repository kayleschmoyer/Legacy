import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from '@tamagui/core';

// Create a proper Tamagui config for web
const config = createTamagui({
  ...defaultConfig,
  // Web-specific settings
  settings: {
    ...defaultConfig.settings,
    allowedStyleValues: 'strict',
    autocompleteSpecificTokens: 'except-special',
    fastSchemeChange: true,
  },
  // Override themes if needed
  themes: {
    ...defaultConfig.themes,
  },
  // Override tokens if needed
  tokens: {
    ...defaultConfig.tokens,
  },
  // Keep animations for web compatibility
  animations: {
    ...defaultConfig.animations,
  },
});

export default config;

// Type the config properly
export type AppConfig = typeof config;
declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}
