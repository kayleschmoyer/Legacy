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
 * Whether the scoreboard should auto-poll for the given games + date. We poll
 * while any game is live, and also while today still has upcoming games — those
 * can transition Upcoming → Live without otherwise triggering a re-fetch.
 */
export function shouldPollScoreboard(
  games: ScoreboardGame[],
  date: string,
): boolean {
  const { liveGames, upcomingGames } = partitionScoreboardGames(games);
  return (
    liveGames.length > 0 || (upcomingGames.length > 0 && date === todayISO())
  );
}
