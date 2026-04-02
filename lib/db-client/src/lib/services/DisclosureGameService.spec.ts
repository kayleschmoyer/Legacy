import { MIN_FACT_COUNT, TIER_SORT_ORDER } from './DisclosureGameService';

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
});
