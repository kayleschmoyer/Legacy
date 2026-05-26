import {
  getPlayerLabel,
  getPositionBadge,
  getSlotOrder,
} from './FootballLeagueRosterScreen';

describe('getSlotOrder', () => {
  it('returns DST slot order when defensiveFormat is dst', () => {
    const order = getSlotOrder('dst');
    expect(order).toContain('DST');
    expect(order).not.toContain('DL');
    expect(order).not.toContain('LB');
    expect(order).not.toContain('DB');
  });

  it('returns DST slot order when defensiveFormat is null', () => {
    const order = getSlotOrder(null);
    expect(order).toContain('DST');
    expect(order).not.toContain('DL');
  });

  it('returns DST slot order when defensiveFormat is undefined', () => {
    const order = getSlotOrder(undefined);
    expect(order).toContain('DST');
    expect(order).not.toContain('DL');
  });

  it('returns IDP slot order when defensiveFormat is idp', () => {
    const order = getSlotOrder('idp');
    expect(order).toContain('DL');
    expect(order).toContain('LB');
    expect(order).toContain('DB');
    expect(order).not.toContain('DST');
  });

  it('includes common offensive slots in both formats', () => {
    const dst = getSlotOrder('dst');
    const idp = getSlotOrder('idp');
    for (const slot of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'BN']) {
      expect(dst).toContain(slot);
      expect(idp).toContain(slot);
    }
  });
});

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
