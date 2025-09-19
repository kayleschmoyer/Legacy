import React from 'react';
import { ApolloClient, ApolloProvider } from '@apollo/client';
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import { Platform } from './platform-components';
import { LoadingPanel } from './LazyLoadingPanel';
import { ConditionalProviders } from './ConditionalProviders';

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
        config={tamaguiConfig as any}
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
        config={tamaguiConfig as any}
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

function AppProvider(props: AppProviderProps) {
  if (Platform.OS === 'web') {
    return <WebLayout {...props} />;
  }
  return <NativeLayout {...props} />;
}

export { AppProvider };
