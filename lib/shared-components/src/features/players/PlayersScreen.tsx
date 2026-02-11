import React, { useCallback } from 'react';
import { PlayersGrid } from './PlayersGrid';
import { PlayerFragment } from './PlayersApi';
// Simple logger fallback for PlayersScreen
const LOGGER = {
  debug: (message: string, ...args: unknown[]) =>
    console.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => console.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
};

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
