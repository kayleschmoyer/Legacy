import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type MinigameId,
  MinigamesHub,
} from '@legacy-sports/shared-components/games';
import { PageMeta } from '../../components/PageMeta';
import { ResumeMockDraftBanner } from '../../components/ResumeMockDraftBanner';

/**
 * Where each hub card's CTA goes. A `Record` keyed by `MinigameId` (rather
 * than an if/else chain) makes the mapping exhaustive at compile time, so a
 * new or renamed game can't silently fall through to — or be wired to — the
 * wrong page (LS-10460).
 */
export const MINIGAME_ROUTES: Record<MinigameId, string> = {
  'season-draft': '/games/season-draft',
  disclosure: '/games/disclosure',
  'twenty-questions': '/games/twenty-questions',
  'mock-draft': '/baseball/mock-draft',
};

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
        banner={<ResumeMockDraftBanner />}
        onNavigate={(id) => navigate(MINIGAME_ROUTES[id])}
      />
    </>
  );
};

export default MinigamesHubPage;
