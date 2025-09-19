import { config } from '@tamagui/config';
import { createTamagui } from 'tamagui';
import type { TamaguiInternalConfig } from 'tamagui';

// Shared Tamagui configuration for all applications in the workspace
// This ensures consistency in design tokens, themes, and components across
// web, mobile, and any other platforms using Tamagui

// Create and export the Tamagui configuration
export const tamaguiConfig: TamaguiInternalConfig = createTamagui(config);

export default tamaguiConfig;
