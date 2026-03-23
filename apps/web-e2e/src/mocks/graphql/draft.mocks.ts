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
  draftId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string | null;
  teamId: number;
  playerId: number | null;
  player: { id: number; firstName: string; lastName: string } | null;
}

export function mockDraftPick(
  overrides: Partial<MockDraftPick> = {},
): MockDraftPick {
  return {
    __typename: 'DraftPick',
    id: 1,
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: null,
    teamId: 1,
    playerId: null,
    player: null,
    ...overrides,
  };
}

export interface MockDraftPlayer {
  __typename: 'DraftPlayer';
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  eligiblePositions: string[];
  hitterAvgPointsPerGame: number | null;
  pitchingAvgPointsPerGame: number | null;
}

export function mockDraftPlayer(
  overrides: Partial<MockDraftPlayer> = {},
): MockDraftPlayer {
  return {
    __typename: 'DraftPlayer',
    id: 100,
    firstName: 'Mike',
    lastName: 'Trout',
    brefId: `player${overrides.id ?? 100}`,
    eligiblePositions: ['CF'],
    hitterAvgPointsPerGame: 5.0,
    pitchingAvgPointsPerGame: null,
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
      getDraftPicks: (picks ?? []).map((p) =>
        mockDraftPick({
          ...p,
          pickedAt:
            p.pickedAt ?? (p.playerId ? new Date().toISOString() : null),
        }),
      ),
    },
  };
}

export function getCurrentDraftPickResponse(
  pick: Partial<{
    draftId: number;
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
    isComplete: boolean;
  }> | null = null,
) {
  return {
    data: {
      getCurrentDraftPick: pick
        ? {
            draftId: pick.draftId ?? 1,
            teamId: pick.teamId ?? 1,
            round: pick.round ?? 1,
            pickNumber: pick.pickNumber ?? 1,
            overallPick: pick.overallPick ?? 1,
            isComplete: pick.isComplete ?? false,
          }
        : null,
    },
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
  return {
    data: {
      makeDraftPick: mockDraftPick({
        pickedAt: new Date().toISOString(),
        ...pick,
      }),
    },
  };
}
