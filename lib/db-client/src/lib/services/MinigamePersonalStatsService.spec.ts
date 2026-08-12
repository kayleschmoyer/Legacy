/**
 * Unit tests for MinigamePersonalStatsService (LS-8803).
 *
 * Covers:
 *   - computeDayStreak: consecutive-day counting, gap handling, dedup, empty input
 *   - getStats: draftsWon / gamesPlayed aggregation across the three minigame
 *     services, and that it delegates the streak calculation to computeDayStreak
 */

import {
  computeDayStreak,
  MinigamePersonalStatsService,
} from './MinigamePersonalStatsService';
import { SeasonDraftGameService } from './SeasonDraftGameService';
import { DisclosureGameService } from './DisclosureGameService';
import { TwentyQuestionsService } from './TwentyQuestionsService';
import type { PublicDb } from '../client/PublicDbClient';

describe('computeDayStreak', () => {
  it('returns 0 for no activity', () => {
    expect(computeDayStreak([])).toBe(0);
  });

  it('returns 1 for a single day of activity', () => {
    expect(computeDayStreak(['2026-08-10'])).toBe(1);
  });

  it('counts consecutive days ending on the most recent date', () => {
    expect(computeDayStreak(['2026-08-08', '2026-08-09', '2026-08-10'])).toBe(
      3,
    );
  });

  it('stops counting at a gap before the most recent date', () => {
    // Missing 2026-08-09 breaks the run — only the 10th counts.
    expect(computeDayStreak(['2026-08-06', '2026-08-07', '2026-08-10'])).toBe(
      1,
    );
  });

  it('dedupes multiple completions on the same day', () => {
    expect(computeDayStreak(['2026-08-10', '2026-08-10', '2026-08-09'])).toBe(
      2,
    );
  });

  it('does not require activity today — the streak is anchored on the most recent activity day', () => {
    // No entry for "today"; the most recent activity was two days ago, with
    // one consecutive day before it.
    expect(computeDayStreak(['2026-08-07', '2026-08-08'])).toBe(2);
  });

  it('accepts full timestamps and truncates to the date', () => {
    expect(
      computeDayStreak([
        '2026-08-09T23:59:00.000Z',
        '2026-08-10T00:01:00.000Z',
      ]),
    ).toBe(2);
  });
});

describe('MinigamePersonalStatsService.getStats', () => {
  const mockDb = {} as PublicDb;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts drafts won only among games flagged won, and sums games played across all three minigames', async () => {
    const seasonDraftSpy = jest
      .spyOn(SeasonDraftGameService, 'getCompletedGamesForUser')
      .mockResolvedValue([
        { gameId: 1, completedAt: '2026-08-10T00:00:00.000Z', won: true },
        { gameId: 2, completedAt: '2026-08-09T00:00:00.000Z', won: false },
      ]);
    jest
      .spyOn(DisclosureGameService.prototype, 'getCompletedSessionsForUser')
      .mockResolvedValue([{ completedAt: '2026-08-10T00:00:00.000Z' }]);
    const twentyQuestionsSpy = jest
      .spyOn(TwentyQuestionsService, 'getCompletedGamesForUser')
      .mockResolvedValue([
        { completedAt: '2026-08-08T00:00:00.000Z' },
        { completedAt: null },
      ]);

    const result = await MinigamePersonalStatsService.getStats(mockDb, 42);

    expect(result.draftsWon).toBe(1);
    expect(result.gamesPlayed).toBe(5);
    expect(seasonDraftSpy).toHaveBeenCalledWith(mockDb, 42);
    expect(twentyQuestionsSpy).toHaveBeenCalledWith(mockDb, 42);
  });

  it('derives the day streak from the union of completion dates across all three minigames', async () => {
    jest
      .spyOn(SeasonDraftGameService, 'getCompletedGamesForUser')
      .mockResolvedValue([
        { gameId: 1, completedAt: '2026-08-10T00:00:00.000Z', won: true },
      ]);
    jest
      .spyOn(DisclosureGameService.prototype, 'getCompletedSessionsForUser')
      .mockResolvedValue([{ completedAt: '2026-08-09T00:00:00.000Z' }]);
    jest
      .spyOn(TwentyQuestionsService, 'getCompletedGamesForUser')
      .mockResolvedValue([{ completedAt: '2026-08-08T00:00:00.000Z' }]);

    const result = await MinigamePersonalStatsService.getStats(mockDb, 42);

    expect(result.dayStreak).toBe(3);
  });

  it('returns zeroes when the user has no minigame activity', async () => {
    jest
      .spyOn(SeasonDraftGameService, 'getCompletedGamesForUser')
      .mockResolvedValue([]);
    jest
      .spyOn(DisclosureGameService.prototype, 'getCompletedSessionsForUser')
      .mockResolvedValue([]);
    jest
      .spyOn(TwentyQuestionsService, 'getCompletedGamesForUser')
      .mockResolvedValue([]);

    const result = await MinigamePersonalStatsService.getStats(mockDb, 42);

    expect(result).toEqual({ draftsWon: 0, dayStreak: 0, gamesPlayed: 0 });
  });
});
