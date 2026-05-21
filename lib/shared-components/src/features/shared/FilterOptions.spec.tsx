import { getPositionsForSport, POSITIONS_BY_SPORT } from './FilterOptions';

describe('FilterOptions sport-driven position lists', () => {
  describe('baseball', () => {
    it('matches the existing baseball filter pill set', () => {
      const baseballValues = POSITIONS_BY_SPORT.baseball.map((p) => p.value);
      expect(baseballValues).toEqual([
        '',
        'P',
        'C',
        '1B',
        '2B',
        '3B',
        'SS',
        'LF',
        'CF',
        'RF',
        'OF',
        'DH',
      ]);
    });

    it('keeps human-readable labels for baseball positions', () => {
      const labels = POSITIONS_BY_SPORT.baseball.map((p) => p.label);
      expect(labels).toContain('All Positions');
      expect(labels).toContain('Pitcher');
      expect(labels).toContain('First Base');
      expect(labels).toContain('Designated Hitter');
    });
  });

  describe('football', () => {
    it('shows QB / RB / WR / TE / K / DEF / FLEX', () => {
      const footballValues = POSITIONS_BY_SPORT.football
        .map((p) => p.value)
        .filter((v) => v !== '');
      expect(footballValues).toEqual([
        'QB',
        'RB',
        'WR',
        'TE',
        'K',
        'DEF',
        'FLEX',
      ]);
    });

    it('includes an All Positions sentinel as the first entry', () => {
      expect(POSITIONS_BY_SPORT.football[0]).toEqual({
        label: 'All Positions',
        value: '',
      });
    });
  });

  describe('getPositionsForSport', () => {
    it('returns the baseball list for sport=baseball', () => {
      expect(getPositionsForSport('baseball')).toBe(
        POSITIONS_BY_SPORT.baseball,
      );
    });

    it('returns the football list for sport=football', () => {
      expect(getPositionsForSport('football')).toBe(
        POSITIONS_BY_SPORT.football,
      );
    });
  });
});
