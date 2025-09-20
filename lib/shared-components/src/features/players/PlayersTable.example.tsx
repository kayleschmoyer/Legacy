import React from 'react';
import { TamaguiProvider } from 'tamagui';
import { ApolloProvider } from '@apollo/client';
import { PlayersTable } from './PlayersTable';
import { PlayersTableDemo } from './PlayersTableDemo';
import { apolloClient } from './apollo-client'; // Your Apollo client
import { tamaguiConfig } from '@legacy-sports/tamagui-config'; // Your Tamagui config

// Logger setup with fallback
let LOGGER: {
  info: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      info: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    info: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.info(...args);
    },
  };
}

// Basic usage
export function SimplePlayersTable() {
  return (
    <TamaguiProvider config={tamaguiConfig as any}>
      <ApolloProvider client={apolloClient}>
        <PlayersTable />
      </ApolloProvider>
    </TamaguiProvider>
  );
}

// Advanced usage with selection
export function PlayerSelectionTable() {
  const handlePlayerSelect = (player: any) => {
    LOGGER.info('Selected player:', player);
    alert(`Selected: ${player.firstName} ${player.lastName}`);
  };

  return (
    <TamaguiProvider config={tamaguiConfig as any}>
      <ApolloProvider client={apolloClient}>
        <PlayersTable
          title="Choose a Player"
          selectable={true}
          compact={true}
          pageSize={15}
          onPlayerSelect={handlePlayerSelect}
        />
      </ApolloProvider>
    </TamaguiProvider>
  );
}

// Demo component with multiple examples
export function PlayersTableShowcase() {
  return (
    <TamaguiProvider config={tamaguiConfig as any}>
      <ApolloProvider client={apolloClient}>
        <PlayersTableDemo title="Players Table Examples" />
      </ApolloProvider>
    </TamaguiProvider>
  );
}
