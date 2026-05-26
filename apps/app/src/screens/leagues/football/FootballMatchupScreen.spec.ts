import {
  getPlayerName,
  getPlayerPosition,
  getPositionOrder,
} from './FootballMatchupScreen';

describe('getPositionOrder', () => {
  it('returns DST position order when defensiveFormat is dst', () => {
    const order = getPositionOrder('dst');
    expect(order).toContain('DST');
    expect(order).not.toContain('DL');
    expect(order).not.toContain('LB');
    expect(order).not.toContain('DB');
  });

  it('returns DST position order when defensiveFormat is null', () => {
    const order = getPositionOrder(null);
    expect(order).toContain('DST');
    expect(order).not.toContain('DL');
  });

  it('returns DST position order when defensiveFormat is undefined', () => {
    const order = getPositionOrder(undefined);
    expect(order).toContain('DST');
  });

  it('returns IDP position order when defensiveFormat is idp', () => {
    const order = getPositionOrder('idp');
    expect(order).toContain('DL');
    expect(order).toContain('LB');
    expect(order).toContain('DB');
    expect(order).not.toContain('DST');
  });

  it('includes common offensive positions in both formats', () => {
    const dst = getPositionOrder('dst');
    const idp = getPositionOrder('idp');
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K']) {
      expect(dst).toContain(pos);
      expect(idp).toContain(pos);
    }
  });
});

describe('getPlayerName', () => {
  it('returns full name when both firstName and lastName are present', () => {
    expect(
      getPlayerName({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB'],
      }),
    ).toBe('Patrick Mahomes');
  });

  it('returns firstName only when lastName is null', () => {
    expect(
      getPlayerName({
        firstName: 'Patrick',
        lastName: null,
        eligiblePositions: [],
      }),
    ).toBe('Patrick');
  });

  it('returns Empty when player is null', () => {
    expect(getPlayerName(null)).toBe('Empty');
  });

  it('returns Unknown when both names are null', () => {
    expect(
      getPlayerName({ firstName: null, lastName: null, eligiblePositions: [] }),
    ).toBe('Unknown');
  });
});

describe('getPlayerPosition', () => {
  it('returns first eligible position', () => {
    expect(
      getPlayerPosition({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB', 'FLEX'],
      }),
    ).toBe('QB');
  });

  it('returns em dash when eligiblePositions is empty', () => {
    expect(
      getPlayerPosition({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: [],
      }),
    ).toBe('—');
  });

  it('returns em dash when player is null', () => {
    expect(getPlayerPosition(null)).toBe('—');
  });
});
