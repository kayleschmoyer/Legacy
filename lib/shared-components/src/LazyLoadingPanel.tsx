import React from 'react';

// Use direct import instead of magic string alias
import { LoadingPanel as PlatformLoadingPanel } from './platform-components';

export interface LoadingPanelProps {
  // Currently no props needed, but using a named interface for future extensibility
  className?: string;
}

// Re-export with the same interface
export const LoadingPanel: React.FC<LoadingPanelProps> = () => {
  return <PlatformLoadingPanel />;
};
