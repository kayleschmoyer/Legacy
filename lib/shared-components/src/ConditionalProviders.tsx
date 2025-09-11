import React from 'react';
import { Platform } from './platform-components';

// Platform-specific providers
interface ProvidersProps {
  children: React.ReactNode;
}

const WebProviders = ({ children }: ProvidersProps) => {
  // For Storybook and development, just return children without OAuth
  // In production, this would include the actual OAuth provider
  return <div data-providers="web">{children}</div>;
};

const NativeProviders = ({ children }: ProvidersProps) => {
  // Add any React Native specific providers here
  return <div data-providers="native">{children}</div>;
};

export function ConditionalProviders({
  children,
}: ProvidersProps): JSX.Element {
  if (Platform.OS === 'web') {
    return <WebProviders>{children}</WebProviders>;
  }
  return <NativeProviders>{children}</NativeProviders>;
}
