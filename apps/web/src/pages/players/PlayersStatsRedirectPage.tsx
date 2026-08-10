import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Permanent redirect from the legacy `/players/stats` route to the canonical
 * `/players` route (LS-9076), preserving the full query string so existing
 * bookmarks, shared links, and indexed search results keep resolving to the
 * exact same filtered/sorted view.
 */
export function PlayersStatsRedirectPage() {
  const location = useLocation();
  return <Navigate to={`/players${location.search}`} replace />;
}
