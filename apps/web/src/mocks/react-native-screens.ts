// Mock React Native Screens for web
// Provides basic no-op implementations for navigation screens

import React, { ReactNode } from 'react';

interface ScreenProps {
  children?: ReactNode;
  [key: string]: unknown;
}

export const Screen = ({ children, ...props }: ScreenProps) =>
  React.createElement('div', props, children);
export const ScreenContainer = ({ children, ...props }: ScreenProps) =>
  React.createElement('div', props, children);
export const ScreenStack = ({ children, ...props }: ScreenProps) =>
  React.createElement('div', props, children);
export const ScreenStackHeaderConfig = ({ children, ...props }: ScreenProps) =>
  React.createElement('div', props, children);

// Default export for the module
export default {
  Screen,
  ScreenContainer,
  ScreenStack,
  ScreenStackHeaderConfig,
};

// Re-export common screens API
// export * from 'react-native-web/dist/cjs/exports/View';
