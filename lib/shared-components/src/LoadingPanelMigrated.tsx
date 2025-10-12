import React from 'react';
import { Spinner, LoadingPanel as UILoadingPanel } from '@legacy-sports/ui-abstractions';
import { PlatformUtils } from './platform-components/wrappers/PlatformUtils';

export interface Props {
  loading?: boolean;
  message?: string;
}

// Migrated component using UI Abstractions
export const LoadingPanel: React.FC<Props> = ({ message = 'Loading...', loading = true }) => {
  if (!loading) {
    return null;
  }

  // Use the abstracted LoadingPanel which handles cross-platform concerns
  return <UILoadingPanel message={message} spinnerSize="large" />;
};

// Alternative: Simple spinner-only version
export const SimpleLoadingSpinner: React.FC<{ size?: 'small' | 'large' }> = ({ 
  size = 'large' 
}) => {
  return <Spinner size={size} />;
};

// Example of platform-specific fallback if needed
export const PlatformAwareLoadingPanel: React.FC<Props> = ({ 
  message = 'Loading...', 
  loading = true 
}) => {
  if (!loading) {
    return null;
  }

  if (PlatformUtils.isWeb) {
    // Use UI Abstractions for web
    return <UILoadingPanel message={message} spinnerSize="large" />;
  }
  
  // Use UI Abstractions for React Native too
  return <UILoadingPanel message={message} spinnerSize="large" />;
};
