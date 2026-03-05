import React from 'react';
import { ApolloClient } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { TamaguiProvider, type TamaguiProviderProps, Theme } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { Platform } from './platform-components';
import { LoadingPanel } from './LazyLoadingPanel';
import { ConditionalProviders } from './ConditionalProviders';

interface AppProviderProps {
  children: React.ReactNode;
  apolloClient: ApolloClient; // Apollo client instance
  tamaguiConfig: TamaguiProviderProps['config']; // Tamagui configuration object
  colorScheme?: 'light' | 'dark';
  isLoading?: boolean;
}

// React Native Layout
const NativeLayout = ({
  children,
  apolloClient,
  tamaguiConfig,
  colorScheme,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config={tamaguiConfig}
        defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
      >
        {/* Theme wrapper ensures live re-renders pick up the active theme */}
        <Theme name={colorScheme === 'dark' ? 'dark' : 'light'}>
          <ConditionalProviders>
            <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
          </ConditionalProviders>
        </Theme>
      </TamaguiProvider>
    );
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    LOGGER.warn('Failed to load native dependencies:', String(error));
    return <LoadingPanel />;
  }
};

// Web Layout
const WebLayout = ({
  children,
  apolloClient,
  tamaguiConfig,
  colorScheme,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        config={tamaguiConfig}
        defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
      >
        {/* Theme wrapper ensures live re-renders pick up the active theme */}
        <Theme name={colorScheme === 'dark' ? 'dark' : 'light'}>
          <div
            className={`app-container ${colorScheme || 'dark'}`}
            style={{
              minHeight: '100vh',
              backgroundColor: colorScheme === 'light' ? '#F7F9FC' : '#0A0F1A',
              color: colorScheme === 'light' ? '#222B45' : '#F8FAFC',
            }}
          >
            <ConditionalProviders>
              <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
            </ConditionalProviders>
          </div>
        </Theme>
      </TamaguiProvider>
    );
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    LOGGER.warn('Failed to load Apollo client:', String(error));
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
