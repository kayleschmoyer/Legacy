import {
  ALLOWED_POSITIONS,
  ALLOWED_POSITIONS_BY_SPORT,
  BATTING_POSITIONS,
  DEFENSIVE_POSITIONS,
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

  it('FLEX accepts RB, WR, TE', () => {
    expect(football['FLEX']).toEqual(['RB', 'WR', 'TE']);
  });

  it('BENCH accepts all offensive + defensive position values', () => {
    expect(football['BENCH']).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
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

describe('DEFENSIVE_POSITIONS (football)', () => {
  it('includes DST (team defense/special teams)', () => {
    expect(DEFENSIVE_POSITIONS.has('DST')).toBe(true);
  });

  it('does not include DEF (renamed to DST in LS-245)', () => {
    expect(DEFENSIVE_POSITIONS.has('DEF')).toBe(false);
  });

  it('does not include offensive positions', () => {
    expect(DEFENSIVE_POSITIONS.has('QB')).toBe(false);
    expect(DEFENSIVE_POSITIONS.has('RB')).toBe(false);
  });
});
