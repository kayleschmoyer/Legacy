import React from 'react';
import { ActivityIndicator } from './platform-components';

export interface LoadingPanelProps {
  // Currently no props needed, but using a named interface for future extensibility
  className?: string;
}

// Use React Native's ActivityIndicator via platform-components
export const LoadingPanel: React.FC<LoadingPanelProps> = () => {
  return <ActivityIndicator />;
};
