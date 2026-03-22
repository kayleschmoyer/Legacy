import React from 'react';
import { DraftBoard } from '../features/draft/DraftBoard';

export const DraftBoardScreen: React.FC = () => {
  // Demo values for the draftboard
  const demoProps = {
    draft: {
      id: 'demo-draft',
      name: 'Demo Draft',
      sport: 'baseball' as const,
      status: 'active' as const,
      currentPick: 1,
      timeRemaining: 120,
      teams: [],
      picks: [],
    },
    availablePlayers: [],
    onPlayerDraft: () => {
      // Demo handler
    },
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Draft Board</h1>
      <p>
        Welcome to the draft board! This is a demo version with sample data.
      </p>
      <DraftBoard {...demoProps} />
    </div>
  );
};
