import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Legacy invite links land on the universal /join/:code route (LS-10078):
 * mock-draft links (/baseball/mock-draft/join[/:inviteCode]) and, since
 * LS-10422, coded league links (/:sport/league/join/:inviteCode). Already-shared
 * links keep working; the code in the URL and any query string (the share
 * links' `?src=share&platform=…`) come along.
 *
 * The bare /:sport/league/join page (public-league Quick Join) is not
 * redirected — it still opens JoinLeagueByCodePage.
 */
export function LegacyJoinRedirect(): React.JSX.Element {
  const { inviteCode } = useParams<{ inviteCode?: string }>();
  const { search } = useLocation();
  const pathname = inviteCode
    ? `/join/${encodeURIComponent(inviteCode)}`
    : '/join';
  return <Navigate to={{ pathname, search }} replace />;
}
