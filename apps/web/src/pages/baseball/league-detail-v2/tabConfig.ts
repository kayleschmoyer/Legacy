import type { LeagueTabDef } from '@legacy-sports/shared-components/leagues';

/**
 * Canonical tab identifiers for the baseball league-detail v2 page. Kept here
 * (rather than in a chrome component) so the page routing logic and the
 * Overview tab can share the type after the chrome was extracted to the
 * cross-platform `LeagueDetailShell`.
 */
export type TabId =
  | 'overview'
  | 'matchup'
  | 'roster'
  | 'free-agents'
  | 'standings'
  | 'trades'
  | 'history'
  | 'team'
  | 'commish';

export const WEB_LEAGUE_TABS: readonly (LeagueTabDef & { id: TabId })[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'matchup', label: 'Matchup' },
  { id: 'roster', label: 'My Roster', memberOnly: true },
  { id: 'free-agents', label: 'Free Agents' },
  { id: 'standings', label: 'Standings' },
  { id: 'trades', label: 'Trades' },
  { id: 'history', label: 'History' },
  { id: 'team', label: 'My Team', memberOnly: true },
  { id: 'commish', label: 'Commissioner', commishOnly: true },
];

export const TAB_IDS: readonly TabId[] = WEB_LEAGUE_TABS.map((t) => t.id);
