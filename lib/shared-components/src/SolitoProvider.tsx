import React from 'react';
import { NavigationProvider, createParam } from 'solito';
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

export function SolitoProvider({ children }: SolitoProviderProps) {
  return (
    <NavigationContainer>
      <NavigationProvider>{children}</NavigationProvider>
    </NavigationContainer>
  );
}
