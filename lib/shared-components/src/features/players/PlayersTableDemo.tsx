import React from 'react';
import { H1, H2, Separator, YStack } from 'tamagui';
import { PlayersTable } from './PlayersTable';
import { PlayerFragment } from './PlayersApi';

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

export interface PlayersTableDemoProps {
  title?: string;
}

export function PlayersTableDemo({
  title = 'Players Table Demo',
}: PlayersTableDemoProps) {
  const handlePlayerSelect = (player: PlayerFragment) => {
    LOGGER.info('Selected player:', player);
    alert(
      `Selected: ${player.firstName} ${player.lastName} (${player.brefId})`,
    );
  };

  return (
    <YStack flex={1} p="$4" space="$4">
      <H1>{title}</H1>

      <YStack space="$4">
        <H2>Default Table</H2>
        <PlayersTable title="All Players" onPlayerSelect={handlePlayerSelect} />

        <Separator />

        <H2>Compact Selectable Table</H2>
        <PlayersTable
          title="Select a Player"
          compact={true}
          selectable={true}
          pageSize={10}
          onPlayerSelect={handlePlayerSelect}
        />
      </YStack>
    </YStack>
  );
}
