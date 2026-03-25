import {
  ALLOWED_POSITIONS,
  BATTING_POSITIONS,
  PITCHING_POSITIONS,
} from './allowed-positions';

describe('ALLOWED_POSITIONS', () => {
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
