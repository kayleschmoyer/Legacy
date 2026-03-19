import React from 'react';
import { DraftBoard } from '@legacy-sports/shared-components';

/**
 * Mobile Draft Board Screen
 *
 * Wraps the shared DraftBoard component for mobile use.
 * The shared component handles player selection, draft timer,
 * team roster display, and filtering cross-platform.
 */
export default function DraftBoardPage() {
  return (
    <DraftBoard
      draft={{
        id: 'default-draft',
        name: 'Fantasy League',
        sport: 'baseball',
        status: 'waiting',
        currentPick: 1,
        timeRemaining: 90,
        teams: [],
        picks: [],
      }}
      availablePlayers={[]}
      onPlayerDraft={() => {
        // Will be wired to draft mutation when league context is available
      }}
    />
  );
}
