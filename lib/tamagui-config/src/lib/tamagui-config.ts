import { config } from '@tamagui/config';
import { createTamagui, type TamaguiConfig } from 'tamagui';

// Shared Tamagui configuration for all applications in the workspace
// This ensures consistency in design tokens, themes, and components across
// web, mobile, and any other platforms using Tamagui

// Create and export the Tamagui configuration
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const tamaguiConfig: TamaguiConfig = createTamagui(config);

export default tamaguiConfig;
