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
});

export default config;

export type Conf = typeof config;

// Ensure types work everywhere you import 'tamagui'
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends Conf {}
}
