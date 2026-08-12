import { DisclosureGameService } from './DisclosureGameService';
import { SeasonDraftGameService } from './SeasonDraftGameService';
import { TwentyQuestionsService } from './TwentyQuestionsService';
import type { PublicDb } from '../client/PublicDbClient';

/**
 * Personal minigame totals for the Game Room "Your Numbers" strip (LS-8803).
 * See the ticket for the definitions of each field.
 */
export interface MinigamePersonalStats {
  draftsWon: number;
  dayStreak: number;
  gamesPlayed: number;
}

/**
 * Consecutive UTC calendar days, ending on the most recent date in
 * `completionDates`, during which at least one minigame was completed each
 * day. A gap anywhere before the most recent date breaks the streak. This
 * is the CURRENT streak (as of the most recent activity), not the longest
 * streak ever recorded — it is not zeroed out for having no activity today.
 *
 * `completionDates` entries may be duplicated and unordered; only the
 * `YYYY-MM-DD` prefix is used.
 */
export function computeDayStreak(completionDates: string[]): number {
  const uniqueDates = [...new Set(completionDates.map((d) => d.slice(0, 10)))]
    .sort()
    .reverse();
  if (uniqueDates.length === 0) return 0;

  let streak = 1;
  const cursor = new Date(`${uniqueDates[0]}T00:00:00.000Z`);
  for (let i = 1; i < uniqueDates.length; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const expected = cursor.toISOString().slice(0, 10);
    if (uniqueDates[i] !== expected) break;
    streak += 1;
  }
  return streak;
}

function toUtcDateString(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export class MinigamePersonalStatsService {
  /**
   * Aggregate the caller's totals across all three minigames (Season Draft,
   * Who Am I?, 20 Questions). See LS-8803 for the field definitions.
   */
  static async getStats(
    db: PublicDb,
    userId: number,
  ): Promise<MinigamePersonalStats> {
    const disclosureGameService = new DisclosureGameService(db);

    const [seasonDraftGames, disclosureSessions, twentyQuestionsGames] =
      await Promise.all([
        SeasonDraftGameService.getCompletedGamesForUser(db, userId),
        disclosureGameService.getCompletedSessionsForUser(userId),
        TwentyQuestionsService.getCompletedGamesForUser(db, userId),
      ]);

    const draftsWon = seasonDraftGames.filter((g) => g.won).length;
    const gamesPlayed =
      seasonDraftGames.length +
      disclosureSessions.length +
      twentyQuestionsGames.length;

    const completionDates = [
      ...seasonDraftGames.map((g) => g.completedAt),
      ...disclosureSessions.map((s) => s.completedAt),
      ...twentyQuestionsGames.map((g) => g.completedAt),
    ]
      .filter((d): d is string => d != null)
      .map(toUtcDateString);

    return {
      draftsWon,
      dayStreak: computeDayStreak(completionDates),
      gamesPlayed,
    };
  }
}
