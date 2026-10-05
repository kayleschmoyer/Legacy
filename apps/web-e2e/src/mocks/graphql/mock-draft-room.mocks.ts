/**
 * The `draftRoom` payload for an ONLINE mock-draft lobby (LS-10076), shared by
 * the mock draft room and Mock Drafts hub (LS-10079) specs.
 */

export interface SeatSpec {
  id: number;
  slot: number;
  seatName: string;
  userId: number | null;
  controller: 'user' | 'ai' | 'open';
}

/** The lobby as `draftRoom` returns it. */
export function draftRoomPayload(options: {
  draftId: number;
  seats: SeatSpec[];
  canHost: boolean;
  seatId: number | null;
  isPublic?: boolean;
  reservedSlots?: number[];
}) {
  return {
    __typename: 'DraftRoom',
    kind: 'MOCK',
    status: 'not-started',
    sport: 'baseball',
    leagueId: null,
    openSeatCount: options.seats.filter(
      (s) =>
        s.controller === 'open' &&
        !(options.reservedSlots ?? []).includes(s.slot),
    ).length,
    reservedSlots: options.reservedSlots ?? [],
    draft: {
      __typename: 'Draft',
      id: options.draftId,
      leagueId: null,
      status: 'not-started',
      sport: 'baseball',
      mockMode: 'ONLINE',
      controlAllTeams: false,
      isPublic: options.isPublic ?? false,
      inviteCode: 'ABCD2345',
      lobbyExpiresAt: '2099-01-01T00:00:00.000Z',
      createdBy: 1,
      draftOrder: 'snake',
      currentPick: 0,
      pickTimeLimitSeconds: 90,
      currentPickDeadline: null,
      draftStartedAt: null,
      draftCompletedAt: null,
      scheduledAt: null,
      autoPickDisabled: false,
    },
    rules: {
      __typename: 'DraftRulesInfo',
      sport: 'baseball',
      playerPool: 'all',
      maxRosterSize: 25,
      defensiveFormat: 'idp',
      rosterPositions: ['C', '1B', '2B', '3B', 'SS', 'OF'],
      isMock: true,
    },
    seats: options.seats.map((seat) => ({
      __typename: 'DraftSeat',
      id: seat.id,
      slot: seat.slot,
      teamId: null,
      userId: seat.userId,
      controller: seat.controller,
      seatName: seat.seatName,
      autoPick: seat.controller === 'ai',
    })),
    viewer: {
      __typename: 'DraftViewer',
      role: options.canHost ? 'host' : 'participant',
      seatId: options.seatId,
      canPick: options.seatId !== null,
      canHost: options.canHost,
    },
  };
}
