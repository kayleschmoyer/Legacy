import React from 'react';
import { ApolloClient, ApolloProvider } from '@apollo/client';
import { TamaguiProvider } from 'tamagui';
import { Platform } from './platform-components';
import { LoadingPanel } from './LazyLoadingPanel';
import { ConditionalProviders } from './ConditionalProviders';

// Logger setup with fallback
let LOGGER: {
  warn: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      warn: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    warn: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.warn(...args);
    },
  };
}

interface AppProviderProps {
  children: React.ReactNode;
  apolloClient: ApolloClient; // Apollo client instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tamaguiConfig: any; // Tamagui configuration object
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
        <ConditionalProviders>
          <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
        </ConditionalProviders>
      </TamaguiProvider>
    );
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    LOGGER.warn('Failed to load native dependencies:', error);
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
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    LOGGER.warn('Failed to load Apollo client:', error);
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
