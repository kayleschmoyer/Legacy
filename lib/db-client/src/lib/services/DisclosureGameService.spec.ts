import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  DisclosureGameService,
  MIN_FACT_COUNT,
  TIER_SORT_ORDER,
} from './DisclosureGameService';
import type { PublicDb } from '../client/PublicDbClient';

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

  describe('getCompletedSessionsForUser (LS-8803)', () => {
    it('returns the rows the query resolves, unmodified', async () => {
      const rows = [
        { completedAt: '2026-08-10T00:00:00.000Z' },
        { completedAt: '2026-08-09T00:00:00.000Z' },
      ];
      const where = jest.fn().mockResolvedValue(rows);
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      const db = { select } as unknown as ConstructorParameters<
        typeof DisclosureGameService
      >[0];

      const service = new DisclosureGameService(db);
      const result = await service.getCompletedSessionsForUser(42);

      expect(result).toEqual(rows);
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

  describe('seedPlayerFacts — planner stats refresh (LS-10554)', () => {
    // Drizzle builders are chainable thenables: every builder method returns
    // the chain, and awaiting it resolves to `rows`.
    function chain(rows: unknown[]): unknown {
      const proxy: unknown = new Proxy(
        {},
        {
          get: (_target, prop) =>
            prop === 'then'
              ? (resolve: (value: unknown[]) => unknown) => resolve(rows)
              : () => proxy,
        },
      );
      return proxy;
    }

    const hallOfFamer = {
      id: 1,
      firstName: 'Test',
      lastName: 'Player',
      allStarSelections: 0,
      goldGloves: 0,
      silverSluggers: 0,
      mvpAwards: 0,
      cyYoungAwards: 0,
      worldSeriesRings: 0,
      hallOfFame: true,
      rookieOfTheYear: false,
    };

    function makeDb(insertedRows: unknown[]) {
      const execute = jest
        .fn<Promise<unknown>, [SQL]>()
        .mockResolvedValue(undefined);
      const db = {
        // First select returns the player list; every per-player stat
        // lookup after that returns no rows.
        select: jest
          .fn()
          .mockReturnValueOnce(chain([hallOfFamer]))
          .mockReturnValue(chain([])),
        insert: jest.fn(() => chain(insertedRows)),
        execute,
      } as unknown as PublicDb;
      return { db, execute };
    }

    const render = (query: SQL) => new PgDialect().sqlToQuery(query).sql;

    it('ANALYZEs player_facts after inserting new facts', async () => {
      const { db, execute } = makeDb([{ id: 10 }]);

      await expect(
        new DisclosureGameService(db).seedPlayerFacts(),
      ).resolves.toBe(1);

      expect(execute).toHaveBeenCalledTimes(1);
      expect(render(execute.mock.calls[0][0])).toBe(
        'ANALYZE public.player_facts',
      );
    });

    it('skips ANALYZE when the seed inserted nothing', async () => {
      const { db, execute } = makeDb([]);

      await expect(
        new DisclosureGameService(db).seedPlayerFacts(),
      ).resolves.toBe(0);

      expect(execute).not.toHaveBeenCalled();
    });
  });
});
