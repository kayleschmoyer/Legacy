import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Permanent redirect from the retired standalone `/football/players` route
 * to the canonical `/players` route with NFL selected (LS-9077). The
 * football browse UI already renders inline through PlayerStatsPage's
 * sport switcher (LS-8442) and shares the same filter query params
 * (`position`, `team`, `search`, `sortBy`, `sortDir`, `view`, `pageSize`,
 * `minProjectedPoints`, `maxAdpRank`), so the existing query string is
 * preserved verbatim alongside `sport=nfl`.
 */
export function FootballPlayersRedirectPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('sport', 'nfl');
  return <Navigate to={`/players?${params.toString()}`} replace />;
}
