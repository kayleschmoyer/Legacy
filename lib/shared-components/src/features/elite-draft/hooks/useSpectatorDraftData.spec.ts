/**
 * useSpectatorDraftData (LS-8942) — asserts the spectator read-set.
 *
 * The core guarantee of this hook is *which queries it does NOT mount*:
 * my-queue, available-players (the pick tool), auto-pick statuses, and
 * recommendations are member-room concerns that must never issue from the
 * spectator surface. Also verifies the current-pick poll (the WS fallback).
 */
import { renderHook } from '@testing-library/react';
import type { DocumentNode } from 'graphql';
import {
  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPitchingStats as GET_DRAFT_PITCHING_STATS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetDraftRecommendations as GET_DRAFT_RECOMMENDATIONS,
  GetDraftTeamAutoPickStatuses as GET_DRAFT_TEAM_AUTO_PICK_STATUSES,
  GetDraftTeamOrder as GET_DRAFT_TEAM_ORDER,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  GetMyDraftQueue as GET_MY_DRAFT_QUEUE,
  GetPositionsForLeague as GET_POSITIONS_FOR_LEAGUE,
} from '@legacy-sports/graphql';
import {
  SPECTATOR_POLL_INTERVAL_MS,
  useSpectatorDraftData,
} from './useSpectatorDraftData';

interface RecordedCall {
  document: DocumentNode;
  options: { skip?: boolean; pollInterval?: number } | undefined;
}

const recordedCalls: RecordedCall[] = [];

jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: RecordedCall['options'],
  ): unknown => {
    recordedCalls.push({ document, options });
    return {
      data: undefined,
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    };
  },
}));

/** Documents actually issued: mounted (not skipped) useQuery calls. */
function issuedDocuments(): DocumentNode[] {
  return recordedCalls.filter((c) => !c.options?.skip).map((c) => c.document);
}

describe('useSpectatorDraftData', () => {
  beforeEach(() => {
    recordedCalls.length = 0;
  });

  it('mounts only the read-only spectator query set', () => {
    renderHook(() => useSpectatorDraftData({ leagueId: 1 }));

    const allowed = new Set<DocumentNode>([
      GET_LEAGUE_BY_ID,
      GET_LEAGUE_TEAMS,
      GET_POSITIONS_FOR_LEAGUE,
      GET_LEAGUE_DRAFT,
      GET_CURRENT_DRAFT_PICK,
      GET_DRAFT_PICKS,
      GET_DRAFT_PLAYER_STATS,
      GET_DRAFT_PITCHING_STATS,
      GET_DRAFT_TEAM_ORDER,
    ]);
    for (const call of recordedCalls) {
      expect(allowed.has(call.document)).toBe(true);
    }
  });

  it('never mounts member-only queries (my queue, player pool, auto-pick, recommendations)', () => {
    renderHook(() => useSpectatorDraftData({ leagueId: 1 }));

    const mounted = new Set(recordedCalls.map((c) => c.document));
    expect(mounted.has(GET_MY_DRAFT_QUEUE)).toBe(false);
    expect(mounted.has(GET_AVAILABLE_DRAFT_PLAYERS)).toBe(false);
    expect(mounted.has(GET_DRAFT_TEAM_AUTO_PICK_STATUSES)).toBe(false);
    expect(mounted.has(GET_DRAFT_RECOMMENDATIONS)).toBe(false);
  });

  it('polls the current pick every ~5s as the WebSocket fallback', () => {
    renderHook(() => useSpectatorDraftData({ leagueId: 1 }));

    const currentPickCall = recordedCalls.find(
      (c) => c.document === GET_CURRENT_DRAFT_PICK,
    );
    expect(currentPickCall).toBeDefined();
    expect(currentPickCall?.options?.pollInterval).toBe(
      SPECTATOR_POLL_INTERVAL_MS,
    );
  });

  it('issues no queries at all without a leagueId', () => {
    renderHook(() => useSpectatorDraftData({ leagueId: null }));
    expect(issuedDocuments()).toEqual([]);
  });
});
