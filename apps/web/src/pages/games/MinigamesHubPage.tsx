import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MinigamesHub } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';

/**
 * Minigames Hub Page
 *
 * Entry point for all Legacy Sports minigames.
 * Route: /games
 */
export const MinigamesHubPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <PageMeta
        title="Minigames — Legacy Sports"
        description="Quick-draft showdowns and trivia built on 150 years of archived baseball statistics."
      />
      <MinigamesHub
        onNavigate={(id) => {
          if (id === 'season-draft') navigate('/games/season-draft');
          else if (id === 'disclosure') navigate('/games/disclosure');
          else if (id === 'twenty-questions')
            navigate('/games/twenty-questions');
        }}
      />
    </>
  );
};

export default MinigamesHubPage;
