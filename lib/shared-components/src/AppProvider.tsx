import React from 'react';
import { ApolloClient } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { TamaguiProvider, type TamaguiProviderProps, Theme } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { Platform } from './platform-components';
import { LoadingPanel } from './LazyLoadingPanel';
import { ConditionalProviders } from './ConditionalProviders';

const DEFAULT_COLOR_SCHEME = 'dark' as const;

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
  colorScheme = DEFAULT_COLOR_SCHEME,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Tamagui's config prop resolves as error type; createTamagui() return is always correct at runtime
        config={tamaguiConfig}
        defaultTheme={colorScheme}
      >
        {/* Theme wrapper ensures live re-renders pick up the active theme */}
        <Theme name={colorScheme}>
          <ConditionalProviders>
            <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
          </ConditionalProviders>
        </Theme>
      </TamaguiProvider>
    );
  } catch (error: unknown) {
    LOGGER.warn('Failed to load native dependencies:', String(error));
    return <LoadingPanel />;
  }
};

// Web Layout
const WebLayout = ({
  children,
  apolloClient,
  tamaguiConfig,
  colorScheme = DEFAULT_COLOR_SCHEME,
  isLoading,
}: AppProviderProps) => {
  if (isLoading) {
    return <LoadingPanel />;
  }

  try {
    return (
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Tamagui's config prop resolves as error type; createTamagui() return is always correct at runtime
        config={tamaguiConfig}
        defaultTheme={colorScheme}
      >
        {/* Theme wrapper ensures live re-renders pick up the active theme */}
        <Theme name={colorScheme}>
          <div
            className={`app-container ${colorScheme}`}
            data-testid="app-container"
            style={{
              minHeight: '100vh',
              backgroundColor: 'var(--background)',
              color: 'var(--color)',
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
