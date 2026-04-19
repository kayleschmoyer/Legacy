import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TwentyQuestionsGame } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';

/**
 * 20 Questions Game Page (LS-1793)
 *
 * Web page wrapper for the shared TwentyQuestionsGame component.
 * Route: /games/twenty-questions
 */
export const TwentyQuestionsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <PageMeta
        title="20 Questions — Guess the Baseball Player"
        description="Ask up to 20 yes/no questions to identify the mystery baseball player. Fewer questions = more tokens."
      />
      <TwentyQuestionsGame onBack={() => navigate(-1)} />
    </>
  );
};

export default TwentyQuestionsPage;
