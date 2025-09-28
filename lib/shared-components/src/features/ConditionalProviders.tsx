// Conditional providers for storybook
import React from 'react';

export interface ConditionalProvidersProps {
  children: React.ReactNode;
  condition?: boolean;
}

export function ConditionalProviders({
  children,
  condition = true,
}: ConditionalProvidersProps) {
  return condition ? children : null;
}
