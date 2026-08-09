/**
 * EliteDraftSpectator — web wrapper
 *
 * The implementation lives in @legacy-sports/shared-components. This wrapper
 * provides web-specific navigation (react-router-dom) and environment config.
 * Read-only page (LS-8943) — no leave-guard needed, unlike EliteDraftBoard.
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SpectatorScreen } from '@legacy-sports/shared-components/elite-draft';
import { env } from '../config/environment';

export function EliteDraftSpectatorScreen(): React.JSX.Element {
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const parsedId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;
  const leagueId =
    parsedId !== null && !Number.isNaN(parsedId) ? parsedId : null;

  return (
    <SpectatorScreen
      leagueId={leagueId}
      onNavigate={(path) => navigate(path)}
      websocketUrl={env.websocketUrl}
    />
  );
}
