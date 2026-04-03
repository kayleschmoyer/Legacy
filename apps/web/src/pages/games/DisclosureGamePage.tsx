import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DisclosureGame } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';

/**
 * Progressive Disclosure Game Page (LS-2113)
 *
 * Web page wrapper for the shared DisclosureGame component.
 * Route: /games/disclosure
 */
export const DisclosureGamePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <PageMeta
        title="Who Am I? — Disclosure Game"
        description="Guess the baseball player from progressively revealed facts. Fewer clues = higher score."
      />
      <DisclosureGame onBack={() => navigate(-1)} />
    </>
  );
};

export default DisclosureGamePage;
