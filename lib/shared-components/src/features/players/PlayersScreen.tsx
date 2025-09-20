import React, { useCallback } from 'react';
import { PlayersGrid } from './PlayersGrid';
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
      LOGGER.info('Selected player:', player);
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
