import {
  ALLOWED_POSITIONS,
  ALLOWED_POSITIONS_BY_SPORT,
  BATTING_POSITIONS,
  DEFENSIVE_POSITIONS,
  deriveFootballSlotOrder,
  FOOTBALL_STARTING_SLOT_DISPLAY_ORDER,
  OFFENSIVE_POSITIONS,
  PITCHING_POSITIONS,
} from './allowed-positions';

describe('ALLOWED_POSITIONS (baseball back-compat alias)', () => {
  it('OF slot accepts generic OF position (LS-1767)', () => {
    expect(ALLOWED_POSITIONS['OF']).toContain('OF');
  });

  it('OF slot also accepts specific outfield positions', () => {
    expect(ALLOWED_POSITIONS['OF']).toContain('LF');
    expect(ALLOWED_POSITIONS['OF']).toContain('RF');
    expect(ALLOWED_POSITIONS['OF']).toContain('CF');
  });

  it('DH slot accepts OF position', () => {
    expect(ALLOWED_POSITIONS['DH']).toContain('OF');
  });

  it('SP/RP slots accept generic P position', () => {
    expect(ALLOWED_POSITIONS['SP']).toContain('P');
    expect(ALLOWED_POSITIONS['RP']).toContain('P');
  });

  it('every ALLOWED_POSITIONS key has a non-empty array', () => {
    for (const [key, positions] of Object.entries(ALLOWED_POSITIONS)) {
      expect(positions.length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });

  it('is identical to ALLOWED_POSITIONS_BY_SPORT.baseball', () => {
    expect(ALLOWED_POSITIONS).toBe(ALLOWED_POSITIONS_BY_SPORT.baseball);
  });
});

describe('ALLOWED_POSITIONS_BY_SPORT.football', () => {
  const football = ALLOWED_POSITIONS_BY_SPORT.football;

  it('QB/RB/WR/TE/K accept only their own position', () => {
    expect(football['QB']).toEqual(['QB']);
    expect(football['RB']).toEqual(['RB']);
    expect(football['WR']).toEqual(['WR']);
    expect(football['TE']).toEqual(['TE']);
    expect(football['K']).toEqual(['K']);
  });

  it('DST slot accepts only DST position (team defense/special teams, LS-245)', () => {
    expect(football['DST']).toEqual(['DST']);
    expect(football['DEF']).toBeUndefined();
  });

  // LS-9475: DL/LB/DB (individual defensive players) — only reachable for
  // an 'idp'-format league; coexists with DST since a league only ever
  // configures one format's slots.
  it('DL/LB/DB slots each accept only their own position', () => {
    expect(football['DL']).toEqual(['DL']);
    expect(football['LB']).toEqual(['LB']);
    expect(football['DB']).toEqual(['DB']);
  });

  it('FLEX accepts RB, WR, TE', () => {
    expect(football['FLEX']).toEqual(['RB', 'WR', 'TE']);
  });

  it('SFLEX (Superflex, premium slot) accepts QB, RB, WR, TE (LS-6337)', () => {
    expect(football['SFLEX']).toEqual(['QB', 'RB', 'WR', 'TE']);
  });

  it('KP (combined kicker/punter, premium slot) accepts K (LS-9675)', () => {
    expect(football['KP']).toEqual(['K']);
  });

  it('BENCH accepts all offensive + defensive position values (both formats)', () => {
    expect(football['BENCH']).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
      'K',
      'DST',
      'DL',
      'LB',
      'DB',
    ]);
  });

  it('every football slot has a non-empty allowed list', () => {
    for (const [key, positions] of Object.entries(football)) {
      expect(positions.length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });
});

describe('BATTING_POSITIONS', () => {
  it('includes OF as a batting position', () => {
    expect(BATTING_POSITIONS.has('OF')).toBe(true);
  });

  it('does not include pitching positions', () => {
    expect(BATTING_POSITIONS.has('SP')).toBe(false);
    expect(BATTING_POSITIONS.has('RP')).toBe(false);
    expect(BATTING_POSITIONS.has('P')).toBe(false);
  });
});

describe('PITCHING_POSITIONS', () => {
  it('includes SP, RP, and P', () => {
    expect(PITCHING_POSITIONS.has('SP')).toBe(true);
    expect(PITCHING_POSITIONS.has('RP')).toBe(true);
    expect(PITCHING_POSITIONS.has('P')).toBe(true);
  });
});

describe('OFFENSIVE_POSITIONS (football)', () => {
  it('includes QB, RB, WR, TE, K, FLEX', () => {
    expect(OFFENSIVE_POSITIONS.has('QB')).toBe(true);
    expect(OFFENSIVE_POSITIONS.has('RB')).toBe(true);
    expect(OFFENSIVE_POSITIONS.has('WR')).toBe(true);
    expect(OFFENSIVE_POSITIONS.has('TE')).toBe(true);
    expect(OFFENSIVE_POSITIONS.has('K')).toBe(true);
    expect(OFFENSIVE_POSITIONS.has('FLEX')).toBe(true);
  });

  it('does not include DST', () => {
    expect(OFFENSIVE_POSITIONS.has('DST')).toBe(false);
  });
});

describe('deriveFootballSlotOrder (LS-9734)', () => {
  it('returns starting slots in canonical order, not leaguePositions row order', () => {
    const order = deriveFootballSlotOrder([
      { positionType: 'DST' },
      { positionType: 'QB' },
      { positionType: 'FLEX' },
      { positionType: 'RB' },
    ]);
    expect(order).toEqual(['QB', 'RB', 'FLEX', 'DST']);
  });

  it('includes a SFLEX slot for a Superflex-configured league', () => {
    const order = deriveFootballSlotOrder([
      { positionType: 'QB' },
      { positionType: 'SFLEX' },
      { positionType: 'RB' },
      { positionType: 'WR' },
      { positionType: 'TE' },
      { positionType: 'K' },
      { positionType: 'DST' },
    ]);
    expect(order).toContain('SFLEX');
    expect(order.indexOf('SFLEX')).toBe(order.indexOf('QB') + 1);
  });

  it('omits slot types the league has no rows for (e.g. DST for an IDP league)', () => {
    const order = deriveFootballSlotOrder([
      { positionType: 'QB' },
      { positionType: 'DL' },
      { positionType: 'LB' },
      { positionType: 'DB' },
    ]);
    expect(order).not.toContain('DST');
    expect(order).toEqual(['QB', 'DL', 'LB', 'DB']);
  });

  it('de-duplicates multiple rows of the same slot type', () => {
    const order = deriveFootballSlotOrder([
      { positionType: 'RB' },
      { positionType: 'RB' },
      { positionType: 'WR' },
      { positionType: 'WR' },
    ]);
    expect(order).toEqual(['RB', 'WR']);
  });

  it('ignores rows with a null/undefined/unknown positionType', () => {
    const order = deriveFootballSlotOrder([
      { positionType: null },
      { positionType: undefined },
      undefined,
      null,
      { positionType: 'QB' },
    ]);
    expect(order).toEqual(['QB']);
  });

  it('returns an empty array for null/undefined/empty input', () => {
    expect(deriveFootballSlotOrder(null)).toEqual([]);
    expect(deriveFootballSlotOrder(undefined)).toEqual([]);
    expect(deriveFootballSlotOrder([])).toEqual([]);
  });

  it('includes IDP_FLEX and ST for an IDP league configured with them (LS-6448)', () => {
    const order = deriveFootballSlotOrder([
      { positionType: 'QB' },
      { positionType: 'DL' },
      { positionType: 'LB' },
      { positionType: 'DB' },
      { positionType: 'IDP_FLEX' },
      { positionType: 'ST' },
    ]);
    expect(order).toEqual(['QB', 'DL', 'LB', 'DB', 'IDP_FLEX', 'ST']);
  });

  it('never returns a slot type outside the canonical display order', () => {
    const order = deriveFootballSlotOrder(
      FOOTBALL_STARTING_SLOT_DISPLAY_ORDER.map((positionType) => ({
        positionType,
      })),
    );
    expect(order).toEqual(FOOTBALL_STARTING_SLOT_DISPLAY_ORDER);
  });
});

describe('DEFENSIVE_POSITIONS (football)', () => {
  it('includes DST (team defense/special teams)', () => {
    expect(DEFENSIVE_POSITIONS.has('DST')).toBe(true);
  });

  it('does not include DEF (renamed to DST in LS-245)', () => {
    expect(DEFENSIVE_POSITIONS.has('DEF')).toBe(false);
  });

  it('includes DL/LB/DB (individual defensive players, LS-9475)', () => {
    expect(DEFENSIVE_POSITIONS.has('DL')).toBe(true);
    expect(DEFENSIVE_POSITIONS.has('LB')).toBe(true);
    expect(DEFENSIVE_POSITIONS.has('DB')).toBe(true);
  });

  it('does not include offensive positions', () => {
    expect(DEFENSIVE_POSITIONS.has('QB')).toBe(false);
    expect(DEFENSIVE_POSITIONS.has('RB')).toBe(false);
  });
});
