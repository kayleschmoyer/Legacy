import {
  buildRenderSlots,
  getPlayerLabel,
  getPositionBadge,
  groupMembersBySlot,
  isMemberOnBye,
} from './FootballLeagueRosterScreen';

jest.mock('@legacy-sports/shared-components', () => ({
  Chip: () => null,
}));

jest.mock('../../../features/subscription/useSubscription', () => ({
  useHasEntitlement: jest.fn(() => false),
}));

jest.mock('../../../features/subscription/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: unknown }) => children,
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: { advanced_search_filters: 'advanced_search_filters' },
}));

describe('getPlayerLabel', () => {
  it('returns full name when both firstName and lastName are present', () => {
    const member = {
      player: {
        firstName: 'Josh',
        lastName: 'Allen',
        eligiblePositions: ['QB'],
      },
    };
    expect(getPlayerLabel(member)).toBe('Josh Allen');
  });

  it('returns firstName only when lastName is null', () => {
    const member = {
      player: { firstName: 'Josh', lastName: null, eligiblePositions: [] },
    };
    expect(getPlayerLabel(member)).toBe('Josh');
  });

  it('returns lastName only when firstName is null', () => {
    const member = {
      player: { firstName: null, lastName: 'Allen', eligiblePositions: [] },
    };
    expect(getPlayerLabel(member)).toBe('Allen');
  });

  it('returns Unknown Player when player is null', () => {
    const member = { player: null };
    expect(getPlayerLabel(member)).toBe('Unknown Player');
  });

  it('returns Unknown Player when both names are null', () => {
    const member = {
      player: { firstName: null, lastName: null, eligiblePositions: [] },
    };
    expect(getPlayerLabel(member)).toBe('Unknown Player');
  });
});

describe('getPositionBadge', () => {
  it('returns first eligible position', () => {
    const member = {
      player: {
        firstName: 'Josh',
        lastName: 'Allen',
        eligiblePositions: ['QB', 'FLEX'],
      },
    };
    expect(getPositionBadge(member)).toBe('QB');
  });

  it('returns em dash when eligiblePositions is empty', () => {
    const member = {
      player: { firstName: 'Josh', lastName: 'Allen', eligiblePositions: [] },
    };
    expect(getPositionBadge(member)).toBe('—');
  });

  it('returns em dash when player is null', () => {
    const member = { player: null };
    expect(getPositionBadge(member)).toBe('—');
  });
});

describe('buildRenderSlots (LS-6449)', () => {
  const slotOrder = ['QB', 'RB', 'BN'] as const;

  it('renders a single generic card for a type with no configured slots', () => {
    const slots = buildRenderSlots(slotOrder, []);
    const qbSlots = slots.filter((s) => s.type === 'QB');
    expect(qbSlots).toEqual([{ key: 'QB', type: 'QB' }]);
  });

  it('renders one card per configured instance for a type with multiple slots', () => {
    const rosterSlots = [
      { id: 10, leagueId: 1, positionType: 'QB' },
      { id: 11, leagueId: 1, positionType: 'QB' },
    ];
    const slots = buildRenderSlots(slotOrder, rosterSlots);
    const qbSlots = slots.filter((s) => s.type === 'QB');
    expect(qbSlots).toEqual([
      { key: 'QB-10', type: 'QB', slotId: 10 },
      { key: 'QB-11', type: 'QB', slotId: 11 },
    ]);
  });

  it('keeps the plain key for a type with exactly one configured slot', () => {
    const rosterSlots = [{ id: 20, leagueId: 1, positionType: 'QB' }];
    const slots = buildRenderSlots(slotOrder, rosterSlots);
    const qbSlots = slots.filter((s) => s.type === 'QB');
    expect(qbSlots).toEqual([{ key: 'QB', type: 'QB', slotId: 20 }]);
  });

  it('always appends a single BN card', () => {
    const slots = buildRenderSlots(slotOrder, []);
    expect(slots.filter((s) => s.key === 'BN')).toHaveLength(1);
  });
});

describe('groupMembersBySlot (LS-6449)', () => {
  it('assigns both QBs to their own configured slot even when their ids are mismatched to array order', () => {
    // Repro: a 2-QB league where both QBs are genuinely rostered, but their
    // positionIds don't line up with the order the slots happen to appear in.
    const rosterSlots = [
      { id: 20, leagueId: 1, positionType: 'QB' },
      { id: 21, leagueId: 1, positionType: 'QB' },
    ];
    const renderSlots = buildRenderSlots(['QB', 'BN'], rosterSlots);

    const qb1 = { id: 1, playerId: 1, positionId: 21, player: null };
    const qb2 = { id: 2, playerId: 2, positionId: 20, player: null };

    const grouped = groupMembersBySlot(renderSlots, [qb1, qb2]);

    expect(grouped['QB-20']).toEqual([qb2]);
    expect(grouped['QB-21']).toEqual([qb1]);
    expect(grouped['BN']).toEqual([]);
  });

  it('only marks a specific configured slot empty when no member is actually assigned to it', () => {
    const rosterSlots = [
      { id: 20, leagueId: 1, positionType: 'QB' },
      { id: 21, leagueId: 1, positionType: 'QB' },
    ];
    const renderSlots = buildRenderSlots(['QB', 'BN'], rosterSlots);

    const qb1 = { id: 1, playerId: 1, positionId: 20, player: null };

    const grouped = groupMembersBySlot(renderSlots, [qb1]);

    expect(grouped['QB-20']).toEqual([qb1]);
    expect(grouped['QB-21']).toEqual([]);
  });

  it('benches a member whose positionId does not match any configured slot', () => {
    const rosterSlots = [{ id: 20, leagueId: 1, positionType: 'QB' }];
    const renderSlots = buildRenderSlots(['QB', 'BN'], rosterSlots);

    const stale = { id: 1, playerId: 1, positionId: 999, player: null };

    const grouped = groupMembersBySlot(renderSlots, [stale]);

    expect(grouped['QB']).toEqual([]);
    expect(grouped['BN']).toEqual([stale]);
  });
});

describe('isMemberOnBye', () => {
  it('returns true when the member is on a team that is on bye this week', () => {
    const member = { player: { nflTeam: 'KC' } };
    expect(isMemberOnBye(member, { KC: 6, BUF: 12 }, 6)).toBe(true);
  });

  it('returns false when the member is on a team that is not on bye this week', () => {
    const member = { player: { nflTeam: 'BUF' } };
    expect(isMemberOnBye(member, { KC: 6, BUF: 12 }, 6)).toBe(false);
  });

  it('returns false when the member has no nflTeam', () => {
    const member = { player: { nflTeam: null } };
    expect(isMemberOnBye(member, { KC: 6 }, 6)).toBe(false);
  });

  it('returns false when currentWeek is null', () => {
    const member = { player: { nflTeam: 'KC' } };
    expect(isMemberOnBye(member, { KC: 6 }, null)).toBe(false);
  });

  it('returns false when byeWeeksByTeam is undefined', () => {
    const member = { player: { nflTeam: 'KC' } };
    expect(isMemberOnBye(member, undefined, 6)).toBe(false);
  });

  it('returns false when player is null', () => {
    const member = { player: null };
    expect(isMemberOnBye(member, { KC: 6 }, 6)).toBe(false);
  });
});
