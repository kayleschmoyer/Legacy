import React from 'react';
import { ApolloClient, ApolloProvider } from '@apollo/client';

interface AppProviderProps {
  children: React.ReactNode;
  apolloClient: ApolloClient<any>;
  colorScheme?: 'light' | 'dark';
  isLoading?: boolean;
}

export function AppProvider({
  children,
  apolloClient,
  colorScheme,
  isLoading,
}: AppProviderProps): JSX.Element {
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#FFFFFF',
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <ApolloProvider client={apolloClient}>
      <div
        style={{
          backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#FFFFFF',
          minHeight: '100vh',
        }}
      >
        {children}
      </div>
    </ApolloProvider>
  );
}
