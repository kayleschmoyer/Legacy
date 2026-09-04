import { useEffect, useState } from 'react';

/**
 * How long the socket must stay down before the board admits it is
 * reconnecting (LS-9856).
 *
 * WebSocketClient's backoff schedule is 1s → 2s → 4s → 8s → 16s → 30s, so a
 * blip that recovers on either of the first two attempts (fired at t+1s and
 * t+3s) is resolved before this elapses and the user sees nothing at all —
 * which is the point: a micro-blip is not news. Past 4s two attempts have
 * already failed, and the board can no longer promise that what it shows is
 * live.
 */
export const DRAFT_RECONNECTING_DELAY_MS = 4_000;

/**
 * How long the socket must stay down before the board stops pretending and
 * shows the full "Connection Lost" state (LS-9856).
 *
 * 15s clears the 3rd and 4th backoff attempts (t+7s, t+15s) and matches one
 * `DRAFT_HEARTBEAT_MS` cycle, so by the time it fires both the reconnect
 * ladder and the zombie-socket detector have had a full turn. Below this the
 * board is very likely seconds from recovering; above it the picks on screen
 * are stale in a way the user has to know about.
 */
export const DRAFT_CONNECTION_LOST_DELAY_MS = 15_000;

/**
 * - `online` — the live feed is trusted (or is not expected at all).
 * - `reconnecting` — down long enough to warn, not long enough to give up.
 * - `lost` — sustained outage; the board's contents can no longer be trusted.
 */
export type DraftConnectionStatus = 'online' | 'reconnecting' | 'lost';

interface UseDraftConnectionStatusParams {
  /** Live socket state from `useWebSocket`. */
  connected: boolean;
  /**
   * Whether a socket is expected at all. False for auction drafts and for a
   * signed-out or league-less screen, where "not connected" is the correct
   * resting state and must never surface as an outage.
   */
  enabled: boolean;
}

/**
 * Debounces raw socket connectivity into a status the UI can render without
 * flickering (LS-9856).
 *
 * Recovery is immediate and unconditional — the moment `connected` goes true
 * the status drops straight back to `online`, which is the same reconnect
 * edge `useDraftWebSocket` already refetches on, so the warning clears in the
 * same tick the fresh data is requested.
 */
export function useDraftConnectionStatus({
  connected,
  enabled,
}: UseDraftConnectionStatusParams): DraftConnectionStatus {
  const [status, setStatus] = useState<DraftConnectionStatus>('online');

  useEffect(() => {
    if (connected || !enabled) {
      setStatus('online');
      return undefined;
    }

    // Down. Escalate on a timer rather than immediately — see the threshold
    // constants above for why these two values.
    const reconnectingTimer = setTimeout(
      () => setStatus('reconnecting'),
      DRAFT_RECONNECTING_DELAY_MS,
    );
    const lostTimer = setTimeout(
      () => setStatus('lost'),
      DRAFT_CONNECTION_LOST_DELAY_MS,
    );

    return () => {
      clearTimeout(reconnectingTimer);
      clearTimeout(lostTimer);
    };
  }, [connected, enabled]);

  return status;
}
