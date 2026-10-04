import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

/**
 * Legacy mock-draft invite links (/baseball/mock-draft/join[/:inviteCode])
 * land on the universal /join/:code route now (LS-10078). Already-shared
 * links keep working; the code in the URL comes along.
 *
 * League invite links (/:sport/league/join/:inviteCode) still open
 * JoinLeagueByCodePage: the live integration suite's join helper drives that
 * page, so moving them is its own change (see the follow-up on LS-10078).
 */
export function LegacyJoinRedirect(): React.JSX.Element {
  const { inviteCode } = useParams<{ inviteCode?: string }>();
  const target = inviteCode
    ? `/join/${encodeURIComponent(inviteCode)}`
    : '/join';
  return <Navigate to={target} replace />;
}
