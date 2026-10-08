/**
 * Shared live-polling effect for the Scoreboard. Each app supplies its own
 * query layer's `startPolling` / `stopPolling` / `refetch` (e.g. Apollo's),
 * keeping the "when to poll" decision in one place across web and native.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  nextScoreboardRefetchDelayMs,
  shouldPollScoreboard,
} from './partition';
import type { ScoreboardGame } from '../../components/scoreboard/types';

/**
 * Live-game poll cadence. Matches the server's 15s live-scoreboard cache TTL,
 * so a faster poll would only re-read the same cached response (LS-10721).
 */
export const SCOREBOARD_LIVE_POLL_MS = 15_000;

// One poller per date. The web header ticker and the /scoreboard page query the
// same date and share one cache entry, so a second poller would only double
// the requests (LS-10721). The first enabled instance for a date owns polling;
// the next one takes over when it unmounts.
const pollersByDate = new Map<string, symbol[]>();
const ownerListeners = new Set<() => void>();

function notifyOwnerListeners(): void {
  for (const listener of ownerListeners) listener();
}

function registerPoller(date: string, token: symbol): void {
  pollersByDate.set(date, [...(pollersByDate.get(date) ?? []), token]);
  notifyOwnerListeners();
}

function unregisterPoller(date: string, token: symbol): void {
  const remaining = (pollersByDate.get(date) ?? []).filter((t) => t !== token);
  if (remaining.length > 0) pollersByDate.set(date, remaining);
  else pollersByDate.delete(date);
  notifyOwnerListeners();
}

function subscribeToOwners(listener: () => void): () => void {
  ownerListeners.add(listener);
  return () => ownerListeners.delete(listener);
}

export interface UseScoreboardLivePollingOptions {
  games: ScoreboardGame[];
  date: string;
  startPolling: (intervalMs: number) => void;
  stopPolling: () => void;
  /** One-shot refetch used to catch an upcoming game going Live. */
  refetch: () => unknown;
  /** False while the query is skipped, so it never claims the date's poller slot. */
  enabled?: boolean;
  /** Override the poll cadence; defaults to {@link SCOREBOARD_LIVE_POLL_MS}. */
  intervalMs?: number;
}

/**
 * Poll the underlying query only while a game is live. With no live game but
 * an upcoming one today, schedule a single refetch for first pitch instead of
 * polling (LS-10721). Polling and timers are always torn down on unmount.
 */
export function useScoreboardLivePolling({
  games,
  date,
  startPolling,
  stopPolling,
  refetch,
  enabled = true,
  intervalMs = SCOREBOARD_LIVE_POLL_MS,
}: UseScoreboardLivePollingOptions): void {
  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol('scoreboard-poller');
  const token = tokenRef.current;

  useEffect(() => {
    if (!enabled) return;
    registerPoller(date, token);
    return () => unregisterPoller(date, token);
  }, [date, enabled, token]);

  const getIsOwner = () => pollersByDate.get(date)?.[0] === token;
  const isOwner = useSyncExternalStore(
    subscribeToOwners,
    getIsOwner,
    getIsOwner,
  );

  const shouldPoll = isOwner && shouldPollScoreboard(games);

  useEffect(() => {
    if (shouldPoll) startPolling(intervalMs);
    else stopPolling();
    return () => stopPolling();
  }, [shouldPoll, intervalMs, startPolling, stopPolling]);

  // Bumped after each scheduled refetch so the next check is re-armed even
  // when the response is unchanged (Apollo then keeps the same `games`).
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    if (!isOwner || shouldPoll) return;
    const refetchInMs = nextScoreboardRefetchDelayMs(games, date);
    if (refetchInMs === null) return;
    const timeout = setTimeout(() => {
      // Errors are already surfaced through the query result.
      Promise.resolve(refetch()).catch(() => undefined);
      setRefetchCount((count) => count + 1);
    }, refetchInMs);
    return () => clearTimeout(timeout);
  }, [isOwner, shouldPoll, games, date, refetch, refetchCount]);
}
