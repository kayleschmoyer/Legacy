import React from 'react';
import { YStack, H1, H2, Separator } from 'tamagui';
import { PlayersTable } from './PlayersTable';
import { PlayerFragment } from './PlayersApi';

export interface PlayersTableDemoProps {
  title?: string;
}

export function PlayersTableDemo({
  title = 'Players Table Demo',
}: PlayersTableDemoProps): JSX.Element {
  const handlePlayerSelect = (player: PlayerFragment) => {
    console.log('Selected player:', player);
    alert(
      `Selected: ${player.firstName} ${player.lastName} (${player.brefId})`,
    );
  };

  return (
    <YStack flex={1} padding="$4" space="$4">
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
