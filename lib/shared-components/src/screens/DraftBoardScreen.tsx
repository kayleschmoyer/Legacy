import React from 'react';
import { DraftBoard } from '../features/draft/DraftBoard';

export const DraftBoardScreen: React.FC = () => {
  // Demo values for the draftboard
  const demoProps = {
    sport: 'football',
    leagueId: 'demo-league',
    teamId: 'demo-team',
    userId: 'demo-user',
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Draft Board</h1>
      <p>Welcome to the draft board! This is a demo version with sample data.</p>
      <DraftBoard {...demoProps} />
    </div>
  );
};
