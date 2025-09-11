import React from 'react';
import { TamaguiProvider } from 'tamagui';
import { ApolloProvider } from '@apollo/client';
import {
  PlayersTable,
  PlayersTableDemo,
} from '@legacy-sports/shared-components';
import { apolloClient } from './apollo-client'; // Your Apollo client
import config from '../../tamagui.config.web'; // Your Tamagui config

// Basic usage
export function SimplePlayersTable() {
  return (
    <TamaguiProvider config={config}>
      <ApolloProvider client={apolloClient}>
        <PlayersTable />
      </ApolloProvider>
    </TamaguiProvider>
  );
}

// Advanced usage with selection
export function PlayerSelectionTable() {
  const handlePlayerSelect = (player) => {
    console.log('Selected player:', player);
    alert(`Selected: ${player.firstName} ${player.lastName}`);
  };

  return (
    <TamaguiProvider config={config}>
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
    <TamaguiProvider config={config}>
      <ApolloProvider client={apolloClient}>
        <PlayersTableDemo title="Players Table Examples" />
      </ApolloProvider>
    </TamaguiProvider>
  );
}
