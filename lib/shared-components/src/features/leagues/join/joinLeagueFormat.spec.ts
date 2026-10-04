import {
  formatDraftDay,
  formatDraftOrder,
  formatLeagueMetaLine,
  formatSelectionMethod,
  formatSpotsFraction,
  formatSpotsRemaining,
  spotMeterFill,
} from './joinLeagueFormat';

describe('joinLeagueFormat (LS-8812)', () => {
  describe('formatLeagueMetaLine', () => {
    it('assembles the full design meta line', () => {
      expect(
        formatLeagueMetaLine({
          numberOfTeams: 12,
          maxRosterSize: 25,
          eraFilter: 'golden_age',
          selectionMethod: 'auction',
          draftDate: '2026-08-15T18:00:00.000Z',
        }),
      ).toBe('12 tm · R25 · Golden Age · Auction · Aug 15');
    });

    it('omits segments the league does not expose rather than blanking them', () => {
      expect(
        formatLeagueMetaLine({ numberOfTeams: 10, maxRosterSize: 20 }),
      ).toBe('10 tm · R20');
    });

    it('falls back to totalSpots when numberOfTeams is absent', () => {
      expect(formatLeagueMetaLine({ totalSpots: 8 })).toBe('8 tm');
    });

    it('drops an "all" era rather than printing it', () => {
      expect(
        formatLeagueMetaLine({ numberOfTeams: 12, eraFilter: 'all' }),
      ).toBe('12 tm');
    });

    it('returns an empty string when nothing is known', () => {
      expect(formatLeagueMetaLine({})).toBe('');
    });
  });

  describe('formatSelectionMethod / formatDraftOrder', () => {
    it('humanizes known enum values', () => {
      expect(formatSelectionMethod('auction')).toBe('Auction');
      expect(formatSelectionMethod('standard')).toBe('Standard');
      expect(formatDraftOrder('snake')).toBe('Snake');
      expect(formatDraftOrder('linear')).toBe('Linear');
    });

    it('returns null for absent or unknown values', () => {
      expect(formatSelectionMethod(null)).toBeNull();
      expect(formatSelectionMethod('mystery')).toBeNull();
      expect(formatDraftOrder(undefined)).toBeNull();
    });
  });

  describe('formatDraftDay', () => {
    it('renders a short month/day', () => {
      expect(formatDraftDay('2026-08-15T18:00:00.000Z')).toBe('Aug 15');
    });

    it('returns null for missing or unparseable input', () => {
      expect(formatDraftDay(null)).toBeNull();
      expect(formatDraftDay('not-a-date')).toBeNull();
    });
  });

  describe('spot helpers', () => {
    it('formats the browse row fraction as available/total', () => {
      expect(formatSpotsFraction({ availableSpots: 8, totalSpots: 12 })).toBe(
        '8/12',
      );
      expect(formatSpotsFraction({})).toBe('0/0');
    });

    it('fills the meter by claimed proportion', () => {
      expect(spotMeterFill(3, 12)).toBeCloseTo(0.75);
      expect(spotMeterFill(12, 12)).toBe(0);
      expect(spotMeterFill(0, 12)).toBe(1);
    });

    it('clamps a meter with no total or out-of-range availability', () => {
      expect(spotMeterFill(4, 0)).toBe(0);
      expect(spotMeterFill(-2, 10)).toBe(1);
      expect(spotMeterFill(99, 10)).toBe(0);
    });

    it('singularizes the remaining-spots label', () => {
      expect(formatSpotsRemaining(1, 12)).toBe('1 of 12 spot left');
      expect(formatSpotsRemaining(3, 12)).toBe('3 of 12 spots left');
      expect(formatSpotsRemaining(0, 12)).toBe('0 of 12 spots left');
    });
  });
});
