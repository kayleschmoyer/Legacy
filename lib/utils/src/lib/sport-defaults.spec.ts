import {
  DEFAULT_BASEBALL_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_IDP_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
  getDefaultRosterPositions,
} from './sport-defaults';

describe('getDefaultRosterPositions (LS-6134)', () => {
  it('returns D/ST positions for a football league with defensiveFormat "dst"', () => {
    expect(getDefaultRosterPositions('football', 'dst')).toBe(
      DEFAULT_FOOTBALL_ROSTER_POSITIONS,
    );
  });

  it('returns D/ST positions for a football league with no defensiveFormat', () => {
    expect(getDefaultRosterPositions('football')).toBe(
      DEFAULT_FOOTBALL_ROSTER_POSITIONS,
    );
    expect(getDefaultRosterPositions('football', null)).toBe(
      DEFAULT_FOOTBALL_ROSTER_POSITIONS,
    );
  });

  it('returns IDP positions (DL/LB/DB) for a football league with defensiveFormat "idp"', () => {
    const positions = getDefaultRosterPositions('football', 'idp');
    expect(positions).toBe(DEFAULT_FOOTBALL_IDP_ROSTER_POSITIONS);
    expect(positions).toEqual(expect.arrayContaining(['DL', 'LB', 'DB']));
    expect(positions).not.toEqual(expect.arrayContaining(['DST']));
    // DP (IDP Flex) has no backend support and was removed in LS-6148/LS-8979.
    expect(positions).not.toEqual(expect.arrayContaining(['DP']));
    // QB1 RB2 WR2 TE1 FLEX1 K1 DL2 LB2 DB2 — matches IDP_ROSTER_DEFAULTS'
    // 14 starters.
    expect(positions).toHaveLength(14);
  });

  it('ignores defensiveFormat for baseball leagues', () => {
    expect(getDefaultRosterPositions('baseball', 'idp')).toBe(
      DEFAULT_BASEBALL_ROSTER_POSITIONS,
    );
  });
});
