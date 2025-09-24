import React from 'react';
import { PlatformProviders } from './platform-components';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Cross-platform ConditionalProviders component
 *
 * Uses the platform-components architecture to automatically select
 * the correct provider implementation based on the target platform.
 *
 * This replaces platform-specific logic with build-time resolution.
 */
export const ConditionalProviders: React.FC<ProvidersProps> = ({
  children,
}) => {
  return <PlatformProviders>{children}</PlatformProviders>;
};
