/**
 * Draft-complete helpers shared by both completion layouts — the wide
 * {@link DraftCompleteView} and the compact {@link DraftRoomRecap} (LS-10528)
 * — so the two viewport tiers offer the same next steps, routed by sport,
 * and resolve another team's roster the same way.
 */
import type { DraftPickRecord, DraftPlayer } from './types';
import type { SportKind } from '../../config/sports';

/**
 * The mock-draft setup page. There is one setup route on both web and
 * native, and the sport is picked inside its form (no `/football/mock-draft`
 * route exists), so "Practice Again" lands here for every sport.
 */
export const MOCK_DRAFT_SETUP_PATH = '/baseball/mock-draft';

export type DraftCompletionActionKey =
  | 'practice-again'
  | 'my-leagues'
  | 'set-lineup'
  | 'back-to-league';

export interface DraftCompletionAction {
  key: DraftCompletionActionKey;
  label: string;
  path: string;
  /** The primary (gold) CTA; the other is secondary. */
  primary: boolean;
}

/**
 * Next-step CTAs for a completed draft. A mock draft has no league
 * (LS-10076), so it offers another practice run plus the sport's home; a
 * league draft offers the roster and the league itself. A league draft
 * without a known league id falls back to the sport's home rather than
 * building a `/league/null` path.
 */
export function getDraftCompletionActions({
  sport,
  isMock,
  leagueId,
}: {
  sport: SportKind;
  isMock: boolean;
  leagueId: number | null;
}): DraftCompletionAction[] {
  const myLeagues: DraftCompletionAction = {
    key: 'my-leagues',
    label: 'Go to My Leagues',
    path: `/${sport}`,
    primary: !isMock,
  };
  if (isMock) {
    return [
      {
        key: 'practice-again',
        label: 'Practice Again',
        path: MOCK_DRAFT_SETUP_PATH,
        primary: true,
      },
      myLeagues,
    ];
  }
  if (leagueId == null) return [myLeagues];
  return [
    {
      key: 'set-lineup',
      label: 'Set My Lineup',
      path: `/${sport}/league/${leagueId}/roster`,
      primary: true,
    },
    {
      key: 'back-to-league',
      label: 'Back to League',
      path: `/${sport}/league/${leagueId}`,
      primary: false,
    },
  ];
}

/**
 * A team's drafted players, index-aligned with `picks`. A pick whose player
 * is missing from `statsLookup` still gets a placeholder row (named from the
 * pick's own player record when present) so roster counts stay honest.
 */
export function resolveDraftedPlayers(
  picks: DraftPickRecord[],
  statsLookup: Map<number, DraftPlayer>,
): DraftPlayer[] {
  return picks.map((pick) => {
    const player = statsLookup.get(pick.playerId);
    if (player) return player;
    const name = pick.player
      ? `${pick.player.firstName} ${pick.player.lastName}`
      : `Unknown Player (ID: ${pick.playerId})`;
    return {
      id: pick.playerId,
      name,
      position: 'UTIL',
      avg: 0,
      hr: 0,
      rbi: 0,
      runs: 0,
      sb: 0,
      games: 0,
      hits: 0,
      obp: 0,
      slg: 0,
    };
  });
}
