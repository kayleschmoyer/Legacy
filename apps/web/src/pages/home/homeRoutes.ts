import type { UserLeagueSummaryFragment } from '@legacy-sports/graphql';

type LeagueRouteSummary = Pick<UserLeagueSummaryFragment, 'leagueId' | 'sport'>;

/** League detail page (`/:sport/league/:id`, app.tsx) — opens on Overview. */
export function leagueDetailRoute(summary: LeagueRouteSummary): string {
  const sportPrefix = summary.sport === 'football' ? 'football' : 'baseball';
  return `/${sportPrefix}/league/${summary.leagueId}`;
}

/**
 * League detail page opened on the My Roster tab (`/:sport/league/:id/:tab`,
 * app.tsx) — the dashboard's Set Lineup target. Mirrors mobile's
 * `initialTab: 'roster'` (LS-8838, LS-10664).
 */
export function leagueRosterRoute(summary: LeagueRouteSummary): string {
  return `${leagueDetailRoute(summary)}/roster`;
}
