import React from 'react';
import { Platform } from 'react-native';
import { ApolloClient, ApolloProvider } from '@apollo/client';
import { TamaguiProvider } from 'tamagui';
import { LoadingPanel } from './LazyLoadingPanel';
import { ConditionalProviders } from './ConditionalProviders';
import config from '../tamagui.config';

interface AppProviderProps {
  children: React.ReactNode;
  apolloClient: ApolloClient; // Apollo client instance
  colorScheme?: 'light' | 'dark';
  isLoading?: boolean;
}

// React Native Layout
const NativeLayout = ({
  children,
  apolloClient,
  colorScheme,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        config={config}
        defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
      >
        <ConditionalProviders>
          <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
        </ConditionalProviders>
      </TamaguiProvider>
    );
  } catch (error) {
    console.warn('Failed to load native dependencies:', error);
    return <LoadingPanel />;
  }
};

// Web Layout
const WebLayout = ({
  children,
  apolloClient,
  colorScheme,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        config={config}
        defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
      >
        <div
          className={`app-container ${colorScheme || 'dark'}`}
          style={{
            minHeight: '100vh',
            backgroundColor: colorScheme === 'light' ? '#F7F9FC' : '#1E1E1E',
            color: colorScheme === 'light' ? '#222B45' : '#FFFFFF',
          }}
        >
          <ConditionalProviders>
            <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
          </ConditionalProviders>
        </div>
      </TamaguiProvider>
    );
  } catch (error) {
    console.warn('Failed to load Apollo client:', error);
    return <LoadingPanel />;
  }
};

export function AppProvider(props: AppProviderProps): JSX.Element {
  if (Platform.OS === 'web') {
    return <WebLayout {...props} />;
  }
  return <NativeLayout {...props} />;
}
