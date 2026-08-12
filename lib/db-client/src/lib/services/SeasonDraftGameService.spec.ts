import { SeasonDraftGameService } from './SeasonDraftGameService';
import type { PublicDb } from '../client/PublicDbClient';

type MyRow = {
  gameId: number;
  completedAt: string | null;
  myDraftOrder: number;
};
type PlayerRow = { gameId: number; totalScore: number; draftOrder: number };

/**
 * Mocks the two sequential `db.select(...)` calls `getCompletedGamesForUser`
 * makes: first the caller's own completed-game rows (select→from→innerJoin→where),
 * then all players in those games (select→from→where→orderBy).
 */
function makeMockDb(myRows: MyRow[], allPlayers: PlayerRow[]) {
  let selectCall = 0;
  return {
    select: jest.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve(myRows),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(allPlayers),
          }),
        }),
      };
    }),
  } as unknown as PublicDb;
}

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

  describe('getCompletedGamesForUser (LS-8803)', () => {
    it('flags the game won when the caller has the highest totalScore', async () => {
      const db = makeMockDb(
        [
          {
            gameId: 1,
            completedAt: '2026-08-10T00:00:00.000Z',
            myDraftOrder: 0,
          },
        ],
        [
          { gameId: 1, totalScore: 100, draftOrder: 0 },
          { gameId: 1, totalScore: 80, draftOrder: 1 },
        ],
      );

      const result = await SeasonDraftGameService.getCompletedGamesForUser(
        db,
        42,
      );

      expect(result).toEqual([
        { gameId: 1, completedAt: '2026-08-10T00:00:00.000Z', won: true },
      ]);
    });

    it('flags the game lost when another player has a higher totalScore', async () => {
      const db = makeMockDb(
        [
          {
            gameId: 1,
            completedAt: '2026-08-10T00:00:00.000Z',
            myDraftOrder: 1,
          },
        ],
        [
          { gameId: 1, totalScore: 100, draftOrder: 0 },
          { gameId: 1, totalScore: 80, draftOrder: 1 },
        ],
      );

      const result = await SeasonDraftGameService.getCompletedGamesForUser(
        db,
        42,
      );

      expect(result).toEqual([
        { gameId: 1, completedAt: '2026-08-10T00:00:00.000Z', won: false },
      ]);
    });

    it('breaks a totalScore tie by the lowest draftOrder, matching winnerName', async () => {
      // Two players tied at 100 — draftOrder 0 wins the tie. The caller is
      // draftOrder 1, so despite matching the top score, they did not win.
      const db = makeMockDb(
        [
          {
            gameId: 1,
            completedAt: '2026-08-10T00:00:00.000Z',
            myDraftOrder: 1,
          },
        ],
        [
          { gameId: 1, totalScore: 100, draftOrder: 0 },
          { gameId: 1, totalScore: 100, draftOrder: 1 },
        ],
      );

      const result = await SeasonDraftGameService.getCompletedGamesForUser(
        db,
        42,
      );

      expect(result).toEqual([
        { gameId: 1, completedAt: '2026-08-10T00:00:00.000Z', won: false },
      ]);
    });

    it('returns an empty array when the user has no completed games', async () => {
      const db = makeMockDb([], []);

      const result = await SeasonDraftGameService.getCompletedGamesForUser(
        db,
        42,
      );

      expect(result).toEqual([]);
    });
  });
});
