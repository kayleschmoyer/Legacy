import {
  DisclosureGameService,
  MIN_FACT_COUNT,
  TIER_SORT_ORDER,
} from './DisclosureGameService';

/**
 * Unit tests for DisclosureGameService pure/static logic.
 *
 * Database-driven methods (seedPlayerFacts, getEligiblePlayers, etc.) are covered
 * by integration tests once the game session API (LS-2106) wires up the full stack.
 * Here we focus on the deterministic constants and tier ordering.
 */
describe('DisclosureGameService', () => {
  describe('MIN_FACT_COUNT', () => {
    it('is a positive integer', () => {
      expect(typeof MIN_FACT_COUNT).toBe('number');
      expect(MIN_FACT_COUNT).toBeGreaterThan(0);
      expect(Number.isInteger(MIN_FACT_COUNT)).toBe(true);
    });

    it('is at least 5 to ensure a minimum playable game', () => {
      expect(MIN_FACT_COUNT).toBeGreaterThanOrEqual(5);
    });
  });

  describe('TIER_SORT_ORDER', () => {
    it('contains all three tiers', () => {
      expect(TIER_SORT_ORDER).toHaveProperty('vague');
      expect(TIER_SORT_ORDER).toHaveProperty('moderate');
      expect(TIER_SORT_ORDER).toHaveProperty('identifying');
    });

    it('orders tiers: vague < moderate < identifying', () => {
      expect(TIER_SORT_ORDER.vague).toBeLessThan(TIER_SORT_ORDER.moderate);
      expect(TIER_SORT_ORDER.moderate).toBeLessThan(
        TIER_SORT_ORDER.identifying,
      );
    });

    it('vague sort order is the lowest value', () => {
      const values = Object.values(TIER_SORT_ORDER);
      expect(TIER_SORT_ORDER.vague).toBe(Math.min(...values));
    });

    it('identifying sort order is the highest value', () => {
      const values = Object.values(TIER_SORT_ORDER);
      expect(TIER_SORT_ORDER.identifying).toBe(Math.max(...values));
    });
  });

  describe('calculateScore', () => {
    it('returns 1000 for first clue (cluesRevealed=1)', () => {
      expect(DisclosureGameService.calculateScore(1, 10)).toBe(1000);
    });

    it('returns 1000 when only one clue exists', () => {
      expect(DisclosureGameService.calculateScore(1, 1)).toBe(1000);
    });

    it('returns 1000 when cluesRevealed is 0', () => {
      expect(DisclosureGameService.calculateScore(0, 10)).toBe(1000);
    });

    it('returns 100 for the last clue (cluesRevealed = totalClues)', () => {
      expect(DisclosureGameService.calculateScore(10, 10)).toBe(100);
    });

    it('returns a value between 100 and 1000 for middle clues', () => {
      const score = DisclosureGameService.calculateScore(5, 10);
      expect(score).toBeGreaterThanOrEqual(100);
      expect(score).toBeLessThanOrEqual(1000);
    });

    it('is monotonically non-increasing as more clues are revealed', () => {
      const totalClues = 10;
      let prev = Infinity;
      for (let i = 1; i <= totalClues; i++) {
        const score = DisclosureGameService.calculateScore(i, totalClues);
        expect(score).toBeLessThanOrEqual(prev);
        prev = score;
      }
    });

    it('never goes below 100', () => {
      for (let i = 1; i <= 20; i++) {
        expect(
          DisclosureGameService.calculateScore(i, 20),
        ).toBeGreaterThanOrEqual(100);
      }
    });

    it('is deterministic for the same inputs', () => {
      expect(DisclosureGameService.calculateScore(5, 10)).toBe(
        DisclosureGameService.calculateScore(5, 10),
      );
    });
  });
});
