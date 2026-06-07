/**
 * Shared live-polling effect for the Scoreboard. Each app supplies its own
 * query layer's `startPolling` / `stopPolling` (e.g. Apollo's), keeping the
 * "when to poll" decision in one place across web and native.
 */
import { useEffect } from 'react';
import { shouldPollScoreboard } from './partition';
import type { ScoreboardGame } from '../../components/scoreboard/types';

/** Default cadence for the live scoreboard auto-refresh. */
export const SCOREBOARD_LIVE_POLL_MS = 15_000;

export interface UseScoreboardLivePollingOptions {
  games: ScoreboardGame[];
  date: string;
  startPolling: (intervalMs: number) => void;
  stopPolling: () => void;
  /** Override the poll cadence; defaults to {@link SCOREBOARD_LIVE_POLL_MS}. */
  intervalMs?: number;
}

/**
 * Start/stop the underlying query's polling based on whether the current slate
 * warrants live updates. Polling is always torn down on unmount.
 */
export function useScoreboardLivePolling({
  games,
  date,
  startPolling,
  stopPolling,
  intervalMs = SCOREBOARD_LIVE_POLL_MS,
}: UseScoreboardLivePollingOptions): void {
  const shouldPoll = shouldPollScoreboard(games, date);

  useEffect(() => {
    if (shouldPoll) startPolling(intervalMs);
    else stopPolling();
    return () => stopPolling();
  }, [shouldPoll, intervalMs, startPolling, stopPolling]);
}
