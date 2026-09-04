import React from 'react';
import { DisclosureGame } from '@legacy-sports/shared-components/games';
import { PageMeta } from '../../components/PageMeta';

/**
 * Progressive Disclosure Game Page (LS-2113)
 *
 * Web page wrapper for the shared DisclosureGame component.
 * Route: /games/disclosure
 */
export const DisclosureGamePage: React.FC = () => {
  return (
    <>
      <PageMeta
        title="Who Am I? — Disclosure Game"
        description="Guess the baseball player from progressively revealed facts. Fewer clues = higher score."
      />
      <DisclosureGame />
    </>
  );
};

export default DisclosureGamePage;
