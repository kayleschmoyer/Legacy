import { SeasonDraftGameService } from './SeasonDraftGameService';

type CheckPositionEligibilityFn = (
  fieldingStats: Array<{ pos: string | null }>,
  position: string,
) => boolean;

// Access private static method for unit testing
const checkPositionEligibility = (
  fieldingStats: Array<{ pos: string | null }>,
  position: string,
): boolean =>
  (
    SeasonDraftGameService as unknown as Record<
      string,
      CheckPositionEligibilityFn
    >
  )['checkPositionEligibility'](fieldingStats, position);

describe('SeasonDraftGameService', () => {
  describe('checkPositionEligibility', () => {
    describe('OF slot', () => {
      it('qualifies a player listed as OF', () => {
        expect(checkPositionEligibility([{ pos: 'OF' }], 'OF')).toBe(true);
      });

      it('qualifies a player listed as LF', () => {
        expect(checkPositionEligibility([{ pos: 'LF' }], 'OF')).toBe(true);
      });

      it('qualifies a player listed as CF', () => {
        expect(checkPositionEligibility([{ pos: 'CF' }], 'OF')).toBe(true);
      });

      it('qualifies a player listed as RF', () => {
        expect(checkPositionEligibility([{ pos: 'RF' }], 'OF')).toBe(true);
      });

      it('does not qualify a player listed as 1B', () => {
        expect(checkPositionEligibility([{ pos: '1B' }], 'OF')).toBe(false);
      });

      it('handles whitespace-padded OF position', () => {
        expect(checkPositionEligibility([{ pos: ' OF ' }], 'OF')).toBe(true);
      });

      it('returns false for empty stats', () => {
        expect(checkPositionEligibility([], 'OF')).toBe(false);
      });
    });

    describe('UT slot', () => {
      it('qualifies any player for UT', () => {
        expect(checkPositionEligibility([{ pos: '1B' }], 'UT')).toBe(true);
        expect(checkPositionEligibility([{ pos: 'OF' }], 'UT')).toBe(true);
        expect(checkPositionEligibility([{ pos: 'P' }], 'UT')).toBe(true);
      });
    });

    describe('specific position slots', () => {
      it('qualifies a player for their exact position', () => {
        expect(checkPositionEligibility([{ pos: '1B' }], '1B')).toBe(true);
        expect(checkPositionEligibility([{ pos: 'SS' }], 'SS')).toBe(true);
        expect(checkPositionEligibility([{ pos: 'P' }], 'P')).toBe(true);
      });

      it('does not qualify a player for a different position', () => {
        expect(checkPositionEligibility([{ pos: '1B' }], '2B')).toBe(false);
      });
    });

    describe('null / missing pos', () => {
      it('handles null pos gracefully', () => {
        expect(checkPositionEligibility([{ pos: null }], 'OF')).toBe(false);
        expect(checkPositionEligibility([{ pos: null }], '1B')).toBe(false);
      });
    });
  });
});
