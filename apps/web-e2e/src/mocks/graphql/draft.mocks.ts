/**
 * Draft GraphQL mock data factories.
 *
 * Covers: getDraft, getDraftPicks, getCurrentDraftPick, getAvailableDraftPlayers,
 *         getDraftQueueEntry, getDraftTeamOrder, startDraft, makeDraftPick, etc.
 */

export interface MockDraft {
  __typename: 'Draft';
  id: number;
  leagueId: number;
  status: 'not-started' | 'queued' | 'in-progress' | 'completed';
  currentRound: number;
  currentPick: number;
  totalRounds: number;
  draftMode: 'live' | 'slow';
  draftOrder: 'snake' | 'linear';
}

export function mockDraft(overrides: Partial<MockDraft> = {}): MockDraft {
  return {
    __typename: 'Draft',
    id: 1,
    leagueId: 1,
    status: 'in-progress',
    currentRound: 1,
    currentPick: 1,
    totalRounds: 25,
    draftMode: 'live',
    draftOrder: 'snake',
    ...overrides,
  };
}

export interface MockDraftPick {
  __typename: 'DraftPick';
  id: number;
  round: number;
  pick: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
}

export function mockDraftPick(
  overrides: Partial<MockDraftPick> = {},
): MockDraftPick {
  return {
    __typename: 'DraftPick',
    id: 1,
    round: 1,
    pick: 1,
    teamId: 1,
    playerId: null,
    playerName: null,
    ...overrides,
  };
}

export interface MockDraftPlayer {
  __typename: 'DraftPlayer';
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  team: string;
}

export function mockDraftPlayer(
  overrides: Partial<MockDraftPlayer> = {},
): MockDraftPlayer {
  return {
    __typename: 'DraftPlayer',
    id: 100,
    firstName: 'Mike',
    lastName: 'Trout',
    position: 'CF',
    team: 'LAA',
    ...overrides,
  };
}

// ── Response factories ──────────────────────────────────────────────

export function getDraftResponse(draft?: Partial<MockDraft>) {
  return { data: { getDraft: mockDraft(draft) } };
}

export function getDraftPicksResponse(picks?: Partial<MockDraftPick>[]) {
  return {
    data: {
      getDraftPicks: (picks ?? []).map((p) => mockDraftPick(p)),
    },
  };
}

export function getCurrentDraftPickResponse(
  pick: Partial<MockDraftPick> | null = null,
) {
  return {
    data: { getCurrentDraftPick: pick ? mockDraftPick(pick) : null },
  };
}

export function getAvailableDraftPlayersResponse(
  players?: Partial<MockDraftPlayer>[],
) {
  return {
    data: {
      getAvailableDraftPlayers: (players ?? [mockDraftPlayer()]).map((p) =>
        mockDraftPlayer(p),
      ),
    },
  };
}

export function startDraftResponse(
  league?: Partial<{ id: number; draftStatus: string }>,
) {
  return {
    data: {
      startDraft: {
        __typename: 'League' as const,
        id: league?.id ?? 1,
        draftStatus: league?.draftStatus ?? 'queued',
      },
    },
  };
}

export function makeDraftPickResponse(pick?: Partial<MockDraftPick>) {
  return { data: { makeDraftPick: mockDraftPick(pick) } };
}
