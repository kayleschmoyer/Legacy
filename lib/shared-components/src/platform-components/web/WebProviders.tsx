// Platform-specific Web Providers
import React from 'react';

interface ProvidersProps {
  children: React.ReactNode;
}

export const WebProviders: React.FC<ProvidersProps> = ({ children }) => {
  // Web-specific providers can be added here
  // For now, just pass through children
  return children;
};
