import React from 'react';

// Build-time import using alias resolution
// This will be resolved to the appropriate platform-specific component at build time
import { LoadingPanel as PlatformLoadingPanel } from '__PLATFORM_COMPONENTS__';

// Re-export with the same interface
export function LoadingPanel(): JSX.Element {
  return <PlatformLoadingPanel />;
}
