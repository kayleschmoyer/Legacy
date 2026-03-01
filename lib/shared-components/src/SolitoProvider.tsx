import React from 'react';
// TODO(LS-323): Fix Solito imports - NavigationProvider not available in current version
// import { NavigationProvider, createParam } from 'solito';
import { createParam } from 'solito';
import { NavigationContainer } from '@react-navigation/native';

export const { useParam } = createParam<{
  Home: undefined;
  Football: undefined;
  Baseball: undefined;
  Demo: undefined;
}>();

interface SolitoProviderProps {
  children: React.ReactNode;
}

function SolitoProvider({ children }: SolitoProviderProps) {
  return (
    <NavigationContainer>
      {/* TODO(LS-323): Restore NavigationProvider when solito import is fixed */}
      {children}
    </NavigationContainer>
  );
}

export { SolitoProvider };
