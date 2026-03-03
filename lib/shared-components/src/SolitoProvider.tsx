import React from 'react';
import {
  createParam,
  SolitoProvider as SolitoNavigationProvider,
} from 'solito';
import { NavigationContainer, useLinkTo } from '@react-navigation/native';

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
      <SolitoNavigationProvider middleware={{ useLinkTo }}>
        {children}
      </SolitoNavigationProvider>
    </NavigationContainer>
  );
}

export { SolitoProvider };
