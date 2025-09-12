import { defaultConfig } from '@tamagui/config/v4';

// Export the default v4 config directly - this is the simplest working pattern
export default defaultConfig;

// Type the config properly
export type AppConfig = typeof defaultConfig;
declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}
