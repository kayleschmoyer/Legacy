import React, { useCallback } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { PlayersGrid } from './PlayersGrid';
import { PlayerFragment } from './PlayersApi';

export interface PlayersScreenProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  title?: string;
}

function PlayersScreen({
  onPlayerSelect,
  pageSize = 50,
  title = 'All Players',
}: PlayersScreenProps) {
  const handlePlayerSelect = useCallback(
    (player: PlayerFragment) => {
      LOGGER.debug('Selected player:', player);
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
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

export { PlayersScreen };
