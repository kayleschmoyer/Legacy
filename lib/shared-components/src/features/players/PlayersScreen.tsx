import React, { useCallback } from 'react';
import { PlayersGrid } from './PlayersGrid';
import { PlayerFragment } from './PlayersApi';

export interface PlayersScreenProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  title?: string;
}

export function PlayersScreen({
  onPlayerSelect,
  pageSize = 50,
  title = 'All Players',
}: PlayersScreenProps): JSX.Element {
  const handlePlayerSelect = useCallback(
    (player: PlayerFragment) => {
      console.log('Selected player:', player);
      onPlayerSelect?.(player);
    },
    [onPlayerSelect]
  );

  return (
    <PlayersGrid
      onPlayerSelect={handlePlayerSelect}
      pageSize={pageSize}
      showSearch={true}
      showSorting={true}
      title={title}
    />
  );
}
