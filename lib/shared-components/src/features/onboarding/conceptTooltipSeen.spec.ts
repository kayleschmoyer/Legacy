import {
  getConceptTooltipSeenKey,
  readConceptTooltipSeen,
  writeConceptTooltipSeen,
} from './conceptTooltipSeen';

describe('conceptTooltipSeen (LS-6886)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('builds a normalized per-term key', () => {
    expect(getConceptTooltipSeenKey('  Season   Assignment ')).toBe(
      'ls_tooltip_seen_season-assignment',
    );
  });

  it('round-trips the seen flag', () => {
    expect(readConceptTooltipSeen('WAR')).toBe(false);
    writeConceptTooltipSeen('WAR');
    expect(readConceptTooltipSeen('WAR')).toBe(true);
    expect(readConceptTooltipSeen('OPS')).toBe(false);
  });

  it('degrades to "not seen" / no-op when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeConceptTooltipSeen('WAR')).not.toThrow();
    expect(readConceptTooltipSeen('WAR')).toBe(false);
  });
});
