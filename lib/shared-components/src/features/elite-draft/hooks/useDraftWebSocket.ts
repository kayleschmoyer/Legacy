import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import type {
  PickSplashQueueItem,
  PickToastQueueItem,
} from './useDraftUIState';
import {
  type DraftCompletedNotification,
  type DraftPausedNotification,
  type DraftPickNotification,
  type DraftPickUndoneNotification,
  type DraftResumedNotification,
  type DraftStartedNotification,
  type UserJoinedNotification,
  type UserLeftNotification,
  type UserListNotification,
  useWebSocket,
} from '../../../hooks/useWebSocket';
import type { AvailableDraftPlayer, DraftPlayer } from '../types';
import { normalizeTeamId } from '../utils';

/** Total attempts (initial try + retries) for each post-reconnect refetch. */
const RECONNECT_REFETCH_ATTEMPTS = 3;
/** Base delay for the exponential backoff between reconnect refetch attempts. */
const RECONNECT_REFETCH_BASE_DELAY_MS = 500;
/**
 * Heartbeat cadence for an active draft — much faster than the client's
 * general-purpose default so a zombie connection is detected and reconnected
 * within seconds instead of minutes, matching the urgency of a live draft
 * board (LS-8880).
 */
const DRAFT_HEARTBEAT_MS = 15 * 1000;

type ReconnectRefetchOutcome = 'ok' | 'cancelled' | 'failed';

/**
 * True when a rejection is a cancellation rather than a real failure.
 *
 * Apollo aborts in-flight queries when the component unmounts or the user
 * navigates away, rejecting the refetch promise with an `AbortError`
 * (a `DOMException` in browsers, a plain `Error` in jsdom). Retrying or
 * reporting these is pointless — the caller no longer exists (LS-502/LS-8506).
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

interface UseDraftWebSocketParams {
  leagueId: number | null;
  draftId: number | null;
  isAuthenticated: boolean;
  isAuctionDraft: boolean;
  myTeamId: number | null;
  enrichedPlayers: DraftPlayer[];
  statsLookup: Map<number, DraftPlayer>;
  teamNameById: (teamId: number | null | undefined) => string;
  notifiedPicksRef: MutableRefObject<Set<number>>;
  showAnnouncement: (
    player: DraftPlayer | AvailableDraftPlayer,
    pickNumber: number,
    round: number,
    roundPickNumber: number,
    myPick: boolean,
    auto: boolean,
    teamName: string,
  ) => void;
  showToast: (
    text: string,
    type?: 'error' | 'warning' | 'info' | 'success',
  ) => void;
  /**
   * Draft Room v2 overlays (LS-9402) — consumers of LS-9397's toast/splash
   * queues. Optional: the spectator screen (useSpectatorScreenState.ts) has
   * no "my team" concept and doesn't pass these, so a pick there simply
   * never enqueues either overlay.
   */
  enqueuePickToast?: (item: PickToastQueueItem) => void;
  enqueuePickSplash?: (item: PickSplashQueueItem) => void;
  setDraftComplete: (v: boolean) => void;
  setDraftPaused: (v: boolean) => void;
  setPickDeadline: (v: Date | null) => void;
  setPickTimeLimitSeconds: (v: number) => void;
  setLiveMessage: (v: string) => void;
  setOnlineUserIds: Dispatch<SetStateAction<ReadonlySet<number>>>;
  refetchDraft: () => Promise<unknown>;
  refetchLeague: () => Promise<unknown>;
  refetchCurrentPick: (vars: { draftId: number }) => Promise<unknown>;
  refetchPickHistory: () => Promise<unknown>;
  refetchAvailablePlayers: () => Promise<unknown>;
  refetchQueue: () => Promise<unknown>;
  refetchAutoPickStatuses: () => Promise<unknown>;
  websocketUrl: string;
  /** Auth token for WebSocket authentication. */
  token?: string;
  /** Optional callback fired when a pick is made (for analytics). */
  onPlayerDrafted?: (playerId: number, position: string) => void;
  /**
   * Optional callback fired when a pick is undone, with the undone pick's
   * overall pick number. The spectator screen uses it to drop the pick from
   * its splash queue (LS-8942).
   */
  onPickUndone?: (overallPick: number) => void;
}

export function useDraftWebSocket({
  leagueId,
  draftId,
  isAuthenticated,
  isAuctionDraft,
  myTeamId,
  enrichedPlayers,
  statsLookup,
  teamNameById,
  notifiedPicksRef,
  showAnnouncement,
  showToast,
  enqueuePickToast,
  enqueuePickSplash,
  setDraftComplete,
  setDraftPaused,
  setPickDeadline,
  setPickTimeLimitSeconds,
  setLiveMessage,
  setOnlineUserIds,
  refetchDraft,
  refetchLeague,
  refetchCurrentPick,
  refetchPickHistory,
  refetchAvailablePlayers,
  refetchQueue,
  refetchAutoPickStatuses,
  websocketUrl,
  token,
  onPlayerDrafted,
  onPickUndone,
}: UseDraftWebSocketParams) {
  // Holds the latest pick notification while debouncing refetches for batch auto-picks.
  const pendingRefetchNotifRef = useRef<DraftPickNotification | null>(null);
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const handleDraftStarted = useCallback(
    (notification: DraftStartedNotification) => {
      setLiveMessage('Draft has started!');
      if (notification.pickTimeLimitSeconds) {
        setPickTimeLimitSeconds(notification.pickTimeLimitSeconds);
      }
      if (notification.currentPickDeadline) {
        setPickDeadline(new Date(notification.currentPickDeadline));
      }
      void refetchDraft();
      void refetchCurrentPick({ draftId: notification.draftId });
    },
    [
      refetchDraft,
      refetchCurrentPick,
      setLiveMessage,
      setPickTimeLimitSeconds,
      setPickDeadline,
    ],
  );

  const handleDraftPickMade = useCallback(
    (notification: DraftPickNotification) => {
      const pickTeamId = normalizeTeamId(notification.teamId);
      const isMyTeamPick = pickTeamId !== null && pickTeamId === myTeamId;

      const pickKey = notification.overallPick;
      if (!notifiedPicksRef.current.has(pickKey)) {
        notifiedPicksRef.current.add(pickKey);

        const pickedPlayer =
          enrichedPlayers.find((p) => p.id === notification.playerId) ??
          statsLookup.get(notification.playerId);

        const playerName =
          pickedPlayer?.name ?? `Unknown (ID: ${notification.playerId})`;
        const position = pickedPlayer?.position ?? '??';
        const teamName = teamNameById(pickTeamId);

        // The lookup misses for most other-team picks: enrichedPlayers is only
        // the client's currently loaded available-players page and statsLookup
        // its stats map, neither of which is guaranteed to hold the drafted
        // player. Fall back to a minimal shape built from the notification's
        // own fields so the announcement still fires instead of being dropped
        // (LS-8845).
        const announcementPlayer: DraftPlayer | AvailableDraftPlayer =
          pickedPlayer ?? {
            id: notification.playerId,
            firstName: 'Unknown',
            lastName: `(ID: ${notification.playerId})`,
            brefId: '',
          };

        showAnnouncement(
          announcementPlayer,
          notification.overallPick,
          notification.round,
          notification.pickNumber,
          isMyTeamPick,
          notification.wasAutoPick,
          teamName,
        );

        // Draft Room v2 overlays (LS-9402): consume the same pick event to
        // populate LS-9397's toast/splash queues — my own pick gets the
        // full-screen splash, every other pick (human or auto) gets the toast.
        if (isMyTeamPick) {
          enqueuePickSplash?.({
            id: String(notification.overallPick),
            player: announcementPlayer,
            pickNumber: notification.overallPick,
            round: notification.round,
            roundPickNumber: notification.pickNumber,
          });
        } else {
          enqueuePickToast?.({
            id: String(notification.overallPick),
            player: announcementPlayer,
            pickNumber: notification.overallPick,
            round: notification.round,
            roundPickNumber: notification.pickNumber,
            teamName,
            isAuto: notification.wasAutoPick,
          });
        }

        if (pickedPlayer) {
          onPlayerDrafted?.(
            notification.playerId,
            pickedPlayer.position ?? '??',
          );
        }

        showToast(
          `Pick #${notification.overallPick}: ${playerName} (${position}) — ${teamName}`,
          'info',
        );
      }

      setLiveMessage(
        `Pick #${notification.overallPick}: Round ${notification.round}, Pick ${notification.pickNumber}`,
      );

      if (notification.nextPick) {
        const nextTeamIdRaw = notification.nextPick.teamId;
        const nextTeamId = normalizeTeamId(
          typeof nextTeamIdRaw === 'number'
            ? nextTeamIdRaw
            : Number(nextTeamIdRaw),
        );
        if (nextTeamId !== null && nextTeamId === myTeamId) {
          showToast('Your turn to pick!', 'info');
        }
      } else if (!notification.nextPick) {
        setDraftComplete(true);
      }

      if (notification.currentPickDeadline) {
        setPickDeadline(new Date(notification.currentPickDeadline));
      }

      // Debounce the refetch operations so that rapid-fire batch auto-picks
      // (e.g. 10 chained picks) only trigger one set of network requests.
      pendingRefetchNotifRef.current = notification;
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
      refetchDebounceRef.current = setTimeout(() => {
        const latest = pendingRefetchNotifRef.current;
        if (!latest) return;
        void refetchCurrentPick({ draftId: latest.draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
        void refetchAutoPickStatuses().catch((e: unknown) =>
          LOGGER.warn('Auto-pick statuses refetch failed:', String(e)),
        );
        void refetchQueue().catch((e: unknown) =>
          LOGGER.warn('Queue refetch failed:', String(e)),
        );
      }, 300);
    },
    [
      myTeamId,
      enrichedPlayers,
      statsLookup,
      teamNameById,
      notifiedPicksRef,
      showAnnouncement,
      showToast,
      enqueuePickToast,
      enqueuePickSplash,
      setLiveMessage,
      setDraftComplete,
      setPickDeadline,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchAutoPickStatuses,
      refetchQueue,
      onPlayerDrafted,
    ],
  );

  const handleDraftCompleted = useCallback(
    (_notification: DraftCompletedNotification) => {
      setDraftComplete(true);
      setDraftPaused(false);
      setLiveMessage('Draft is complete!');
      void refetchLeague();
      // Refresh leagueDraft so draftCompletedAt is stored in the Apollo cache.
      // Without this, a component re-mount (or missed last-pick WS event) leaves
      // draftCompletedAt as null and the "Draft Complete!" banner never renders
      // unless the user manually reloads the page (LS-3823).
      void refetchDraft();
    },
    [
      refetchDraft,
      refetchLeague,
      setDraftComplete,
      setDraftPaused,
      setLiveMessage,
    ],
  );

  const handleDraftPaused = useCallback(
    (notification?: DraftPausedNotification) => {
      setDraftPaused(true);
      // pauseDraft only succeeds from draftStatus 'in-progress' (see
      // pause-resume-draft.ts), so a DraftPaused event is proof the draft is
      // not complete. Without this reset, a draft-complete flag latched
      // earlier from a stale/misrouted WS notification (handleDraftPickMade's
      // missing-nextPick inference, or handleDraftCompleted) can never be
      // cleared, permanently stranding the draft room on "Draft Complete!"
      // even while the server correctly reports 'paused' (LS-8849).
      setDraftComplete(false);
      setLiveMessage(
        notification?.pausedAt
          ? `Draft paused at ${new Date(notification.pausedAt).toLocaleTimeString()}`
          : 'Draft has been paused by the commissioner.',
      );
      showToast('Draft paused by commissioner', 'warning');
    },
    [showToast, setDraftComplete, setDraftPaused, setLiveMessage],
  );

  const handleDraftResumed = useCallback(
    (notification?: DraftResumedNotification) => {
      setDraftPaused(false);
      if (notification?.currentPickDeadline) {
        setPickDeadline(new Date(notification.currentPickDeadline));
      }
      setLiveMessage(
        notification?.resumedAt
          ? `Draft resumed at ${new Date(notification.resumedAt).toLocaleTimeString()}`
          : 'Draft has been resumed!',
      );
      showToast('Draft resumed!', 'info');
      if (draftId) void refetchCurrentPick({ draftId });
    },
    [
      draftId,
      showToast,
      refetchCurrentPick,
      setDraftPaused,
      setPickDeadline,
      setLiveMessage,
    ],
  );

  const handleDraftPickUndone = useCallback(
    (notification: DraftPickUndoneNotification) => {
      setLiveMessage(
        `Pick #${notification.overallPick} has been undone by the commissioner.`,
      );
      showToast(`Pick #${notification.overallPick} undone`, 'info');
      if (notification.newPickDeadline) {
        setPickDeadline(new Date(notification.newPickDeadline));
      }
      setDraftComplete(false);
      onPickUndone?.(notification.overallPick);
      if (draftId) void refetchCurrentPick({ draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
      void refetchDraft();
    },
    [
      draftId,
      showToast,
      setLiveMessage,
      setDraftComplete,
      setPickDeadline,
      onPickUndone,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchDraft,
    ],
  );

  // Presence handlers
  const handleUserJoined = useCallback(
    (notification: UserJoinedNotification) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(notification.userId);
        return next;
      });
    },
    [setOnlineUserIds],
  );

  const handleUserLeft = useCallback(
    (notification: UserLeftNotification) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(notification.userId);
        return next;
      });
    },
    [setOnlineUserIds],
  );

  const handleUserList = useCallback(
    (notification: UserListNotification) => {
      setOnlineUserIds(new Set(notification.users.map((u) => u.userId)));
    },
    [setOnlineUserIds],
  );

  const {
    connected: wsConnected,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendMessage,
  } = useWebSocket({
    url: websocketUrl,
    token,
    leagueId: leagueId ?? undefined,
    viewContext: 'league',
    autoConnect: !!leagueId && isAuthenticated && !isAuctionDraft,
    heartbeatMs: DRAFT_HEARTBEAT_MS,
    onDraftStarted: handleDraftStarted,
    onDraftPickMade: handleDraftPickMade,
    onDraftPickUndone: handleDraftPickUndone,
    onDraftCompleted: handleDraftCompleted,
    onDraftPaused: handleDraftPaused,
    onDraftResumed: handleDraftResumed,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onUserList: handleUserList,
  });

  // Clear pending debounce on unmount to prevent post-unmount state updates.
  useEffect(() => {
    return () => {
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    };
  }, []);

  // BFCache (back-forward cache) restoration recovery (LS-6792). iOS Safari
  // and Android Chrome can restore a frozen page from BFCache with the old
  // WebSocket object still reporting `readyState === OPEN` even though the
  // underlying connection is dead — a plain `connect()` would see that and
  // no-op ("Already connected"), leaving the user silently disconnected with
  // no fresh handshake. Force a real close + reopen instead: `disconnect()`
  // unconditionally tears down the socket and emits `disconnected`, then
  // `connect()` opens a new one and emits `connected` on success. That
  // `disconnected -> connected` edge is exactly what the reconnection
  // recovery effect below already watches for, so it drives the full
  // refetch without any duplicated notification-handler registration (the
  // notification subscriptions live for the lifetime of the WebSocketClient
  // instance in useWebSocket and are not re-created by connect/disconnect).
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return undefined;
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // Proactively release the socket before the page freezes so it can't
      // linger as a stale "open" connection while in the BFCache.
      wsDisconnect();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      wsDisconnect();
      wsConnect();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [wsConnect, wsDisconnect]);

  // Reconnection recovery
  const wsWasConnected = useRef(false);
  const wsHasEverConnected = useRef(false);
  useEffect(() => {
    // Recover only on a genuine disconnect -> reconnect edge. The previous
    // condition (`wsConnected && wsWasConnected.current`) was true on *every*
    // re-run of this effect while connected, so it fired on the ordinary
    // `draftId: null -> 42` transition during initial page load — issuing a
    // duplicate set of refetches that the initial queries had already made,
    // and mislabelling them as reconnect recovery (LS-8506).
    const isReconnect =
      wsConnected && !wsWasConnected.current && wsHasEverConnected.current;
    wsWasConnected.current = wsConnected;
    if (wsConnected) wsHasEverConnected.current = true;
    if (!isReconnect || draftId === null) return undefined;

    // A reconnect that lands during the 300ms pick-notification debounce
    // window must cancel that timer — otherwise both it and the reconnect
    // recovery below fire their own refetches, doubling network traffic
    // (LDB-031).
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
      refetchDebounceRef.current = undefined;
    }
    pendingRefetchNotifRef.current = null;

    let cancelled = false;
    const pendingWaits = new Map<ReturnType<typeof setTimeout>, () => void>();

    // Cleanup resolves pending waits rather than only clearing their timers, so
    // a backoff suspended at unmount resumes once and exits via the `cancelled`
    // check at the top of the retry loop instead of hanging forever.
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          pendingWaits.delete(timer);
          resolve();
        }, ms);
        pendingWaits.set(timer, resolve);
      });

    /**
     * Run one post-reconnect refetch, retrying transient failures with
     * exponential backoff. The underlying error is logged as a structured
     * object (not `String(e)`) so `name`/`stack`/Apollo's `graphQLErrors`
     * survive into the Rollbar payload — stringifying it destroyed the cause
     * and bypassed the `AbortError` noise filter in lib/rollbar (LS-8506).
     */
    const refetchWithRetry = async (
      label: string,
      run: () => Promise<unknown>,
    ): Promise<ReconnectRefetchOutcome> => {
      for (let attempt = 1; attempt <= RECONNECT_REFETCH_ATTEMPTS; attempt++) {
        if (cancelled) return 'cancelled';
        try {
          await run();
          return 'ok';
        } catch (error: unknown) {
          if (cancelled || isAbortError(error)) {
            LOGGER.debug(
              `Refetch of ${label} cancelled after websocket reconnect`,
              { error },
            );
            return 'cancelled';
          }
          if (attempt === RECONNECT_REFETCH_ATTEMPTS) {
            LOGGER.error(
              `Failed to refetch ${label} after websocket reconnect`,
              { attempts: attempt, error },
            );
            return 'failed';
          }
          await wait(RECONNECT_REFETCH_BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
      return 'failed';
    };

    // Presence (onlineTeamIds) is WS-only — there is no GraphQL refetch to
    // fall back on. The server pushes a fresh USER_LIST on every new
    // connection, but that push is best-effort, so explicitly re-request one
    // here too: userJoined/userLeft events missed while disconnected would
    // otherwise leave presence stale until the next full page mount
    // (LDB-028).
    if (leagueId) sendMessage({ type: 'requestUserList', leagueId });

    void refetchWithRetry('current pick', () =>
      refetchCurrentPick({ draftId }),
    );
    void refetchWithRetry('pick history', refetchPickHistory);
    void refetchWithRetry('auto-pick statuses', refetchAutoPickStatuses);
    void refetchWithRetry('draft', refetchDraft);
    // The queue is the server's first auto-pick source (auto-pick-scorer.ts),
    // so a stale queue snapshot can show players already drafted while
    // disconnected (LS-6787).
    void refetchWithRetry('queue', refetchQueue);
    // The available-players list is the one stale-state a user can act on: an
    // out-of-date board lets them try to draft an already-taken player. Warn
    // them explicitly rather than failing silently.
    void refetchWithRetry('available players', refetchAvailablePlayers).then(
      (outcome) => {
        if (outcome === 'failed' && !cancelled) {
          showToast(
            'Could not refresh the player list after reconnecting — it may be out of date. Reload the page before drafting.',
            'warning',
          );
        }
      },
    );

    return () => {
      cancelled = true;
      pendingWaits.forEach((resolve, timer) => {
        clearTimeout(timer);
        resolve();
      });
      pendingWaits.clear();
    };
  }, [
    wsConnected,
    draftId,
    leagueId,
    sendMessage,
    showToast,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
    refetchAutoPickStatuses,
    refetchDraft,
    refetchQueue,
  ]);

  return { wsConnected } as const;
}
