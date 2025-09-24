// Platform-specific Mobile Providers
import React from 'react';

interface ProvidersProps {
  children: React.ReactNode;
}

export const MobileProviders: React.FC<ProvidersProps> = ({ children }) => {
  // Mobile-specific providers can be added here
  // For now, just pass through children
  return children;
};
