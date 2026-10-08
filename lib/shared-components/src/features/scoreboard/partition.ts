/**
 * Pure game-bucketing + live-polling helpers backing the Scoreboard container.
 * Decoupled from any platform so web and native share identical behaviour.
 */
import { todayISO } from './dateUtils';
import type { ScoreboardGame } from '../../components/scoreboard/types';

export interface PartitionedGames {
  liveGames: ScoreboardGame[];
  upcomingGames: ScoreboardGame[];
  finalGames: ScoreboardGame[];
  postponedGames: ScoreboardGame[];
}

/**
 * Bucket scoreboard games by status. Postponed games are split out so they
 * never appear under "Upcoming" — they will not be played that day (LS-4838).
 */
export function partitionScoreboardGames(
  games: ScoreboardGame[],
): PartitionedGames {
  const liveGames: ScoreboardGame[] = [];
  const upcomingGames: ScoreboardGame[] = [];
  const finalGames: ScoreboardGame[] = [];
  const postponedGames: ScoreboardGame[] = [];
  for (const game of games) {
    switch (game.status) {
      case 'Live':
        liveGames.push(game);
        break;
      case 'Final':
        finalGames.push(game);
        break;
      case 'Postponed':
        postponedGames.push(game);
        break;
      default:
        upcomingGames.push(game);
    }
  }
  return { liveGames, upcomingGames, finalGames, postponedGames };
}

/**
 * Recheck cadence once an upcoming game's first pitch has passed but the feed
 * has not flipped it to Live yet (feed lag, delayed start). Keeps "polling
 * resumes within 5 minutes of first pitch" without a live-rate poll (LS-10721).
 */
export const SCOREBOARD_PREGAME_RECHECK_MS = 2 * 60_000;

/**
 * Whether the scoreboard should auto-poll: only while a game is live. With no
 * live game nothing changes between fetches, so polling would only add load
 * on the upstream feed (LS-10721).
 */
export function shouldPollScoreboard(games: ScoreboardGame[]): boolean {
  return games.some((game) => game.status === 'Live');
}

/**
 * How long until a single refetch should check whether today's next game has
 * gone Live, or `null` when nothing is pending. Upcoming games can flip to Live
 * without otherwise triggering a fetch, so instead of polling for hours before
 * first pitch we refetch once at the earliest start time, then every
 * {@link SCOREBOARD_PREGAME_RECHECK_MS} until that game goes Live (LS-10721).
 */
export function nextScoreboardRefetchDelayMs(
  games: ScoreboardGame[],
  date: string,
  nowMs: number = Date.now(),
): number | null {
  if (date !== todayISO()) return null;
  const startTimes = partitionScoreboardGames(games)
    .upcomingGames.map((game) =>
      game.startTime ? Date.parse(game.startTime) : NaN,
    )
    .filter((ms) => !Number.isNaN(ms));
  if (startTimes.length === 0) return null;
  const untilFirstPitch = Math.min(...startTimes) - nowMs;
  return untilFirstPitch > 0 ? untilFirstPitch : SCOREBOARD_PREGAME_RECHECK_MS;
}
