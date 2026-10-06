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
import { useDraftConnectionStatus } from './useDraftConnectionStatus';
import {
  type DraftCompletedNotification,
  type DraftPausedNotification,
  type DraftPickNotification,
  type DraftPickUndoneNotification,
  type DraftResumedNotification,
  type DraftStartedNotification,
  type LeagueDeletedNotification,
  type UserJoinedNotification,
  type UserLeftNotification,
  type UserListNotification,
  useWebSocket,
} from '../../../hooks/useWebSocket';
import { useAppForeground } from '../../../hooks/useAppForeground';
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
/**
 * Background time past which returning to the foreground forces a brand-new
 * socket rather than trusting the old one: the OS freezes a minimized app's
 * JS thread, so a socket that "survived" a longer absence is likely a zombie
 * that missed events and whose heartbeat never got a chance to notice
 * (LS-10593).
 */
const FOREGROUND_FORCE_RECONNECT_MS = 5 * 1000;
/**
 * A foreground resync is typically followed within moments by the socket's
 * disconnect -> reconnect edge; skip the second resync inside this window
 * so the same data isn't refetched twice (LS-10593).
 */
const RESYNC_DEDUPE_MS = 2 * 1000;

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
  /**
   * @deprecated Unused: the draft room joins the draft channel by `draftId`
   * only (LS-10080). Kept until the callers stop passing it.
   */
  leagueId?: number | null;
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
  /**
   * Resolves a player the client has not loaded (LS-10627). A pick by another
   * user routinely names a player outside the loaded available-players page
   * and stats map; when the local lookup misses, the announcement waits for
   * this fetch instead of showing a placeholder. Optional: without it (or if
   * it fails / returns null) the placeholder fallback below still announces.
   */
  fetchPlayer?: (playerId: number) => Promise<AvailableDraftPlayer | null>;
  /** Optional callback fired when a pick is made (for analytics). */
  onPlayerDrafted?: (playerId: number, position: string) => void;
  /**
   * Optional callback fired when a pick is undone, with the undone pick's
   * overall pick number. The spectator screen uses it to drop the pick from
   * its splash queue (LS-8942).
   */
  onPickUndone?: (overallPick: number) => void;
  /**
   * Fired when the league (and so this draft) is deleted while the room is
   * open. The room has nothing left to show, so the screen should leave.
   */
  onLeagueDeleted?: () => void;
}

export function useDraftWebSocket({
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
  fetchPlayer,
  onPlayerDrafted,
  onPickUndone,
  onLeagueDeleted,
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
      // A mock-draft pick carries no team — the seat is its key, and the
      // board's "team" ids are seat ids in that mode (LS-10076).
      const pickTeamId = normalizeTeamId(
        notification.teamId ?? notification.participantId,
      );
      const isMyTeamPick = pickTeamId !== null && pickTeamId === myTeamId;

      const pickKey = notification.overallPick;
      if (!notifiedPicksRef.current.has(pickKey)) {
        notifiedPicksRef.current.add(pickKey);

        const teamName = teamNameById(pickTeamId);

        const announcePick = (
          pickedPlayer: DraftPlayer | AvailableDraftPlayer | undefined,
        ) => {
          const playerName = pickedPlayer
            ? 'name' in pickedPlayer
              ? pickedPlayer.name
              : `${pickedPlayer.firstName} ${pickedPlayer.lastName}`.trim()
            : `Unknown (ID: ${notification.playerId})`;
          const position =
            (pickedPlayer && 'position' in pickedPlayer
              ? pickedPlayer.position
              : pickedPlayer?.eligiblePositions?.[0]) ?? '??';

          // Last resort when neither the local lookup nor the on-demand fetch
          // resolved the player: a minimal shape built from the
          // notification's own fields so the announcement still fires instead
          // of being dropped (LS-8845).
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
          // full-screen splash, every other pick (human or auto) gets the
          // toast.
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
            onPlayerDrafted?.(notification.playerId, position);
          }

          showToast(
            `Pick #${notification.overallPick}: ${playerName} (${position}) — ${teamName}`,
            'info',
          );
        };

        // The lookup misses for most other-team picks: enrichedPlayers is only
        // the client's currently loaded available-players page and statsLookup
        // its stats map, neither of which is guaranteed to hold the drafted
        // player. Fetch the missing player on demand so the announcement shows
        // their name rather than a placeholder (LS-10627).
        const localPlayer =
          enrichedPlayers.find((p) => p.id === notification.playerId) ??
          statsLookup.get(notification.playerId);

        if (localPlayer || !fetchPlayer) {
          announcePick(localPlayer);
        } else {
          fetchPlayer(notification.playerId)
            .then((fetched) => announcePick(fetched ?? undefined))
            .catch((e: unknown) => {
              LOGGER.warn('Pick player fetch failed:', String(e));
              announcePick(undefined);
            });
        }
      }

      setLiveMessage(
        `Pick #${notification.overallPick}: Round ${notification.round}, Pick ${notification.pickNumber}`,
      );

      if (notification.nextPick) {
        const nextTeamIdRaw =
          notification.nextPick.teamId ?? notification.nextPick.participantId;
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
      fetchPlayer,
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
      // Picks are announced once per overall pick number. After an undo the
      // same slot (and every later one rolled back with it) gets re-picked —
      // often by the commissioner on the team's behalf — so forget them, or
      // the re-pick is silently swallowed and that team's user never sees
      // it announced (LS-10593).
      notifiedPicksRef.current.forEach((pickKey) => {
        if (pickKey >= notification.overallPick) {
          notifiedPicksRef.current.delete(pickKey);
        }
      });
      onPickUndone?.(notification.overallPick);
      if (draftId) void refetchCurrentPick({ draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
      void refetchDraft();
      // An undone pick may have consumed a queued player or flipped a team's
      // auto-pick state — refresh both rather than show stale rails.
      void refetchQueue().catch((e: unknown) =>
        LOGGER.warn('Queue refetch failed:', String(e)),
      );
      void refetchAutoPickStatuses().catch((e: unknown) =>
        LOGGER.warn('Auto-pick statuses refetch failed:', String(e)),
      );
    },
    [
      draftId,
      showToast,
      setLiveMessage,
      setDraftComplete,
      setPickDeadline,
      notifiedPicksRef,
      onPickUndone,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchDraft,
      refetchQueue,
      refetchAutoPickStatuses,
    ],
  );

  const handleLeagueDeleted = useCallback(
    (notification: LeagueDeletedNotification) => {
      // Ignore a stale event for another draft room on a shared connection.
      if (draftId !== null && !notification.draftIds.includes(draftId)) return;
      setLiveMessage('This league was deleted.');
      showToast('This league was deleted.', 'warning');
      onLeagueDeleted?.();
    },
    [draftId, setLiveMessage, showToast, onLeagueDeleted],
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

  // Whether a live socket is expected at all. Auction drafts and the
  // signed-out / draft-less states never open one, so "not connected" is
  // their correct resting state and must not read as an outage (LS-9856).
  // The socket waits for the draftId: draft-room events are delivered on the
  // draft channel only (LS-10080), so the league channel would carry none of
  // them. Every league has a draft row, so a league draft's id resolves with
  // its first query.
  const socketExpected = !!draftId && isAuthenticated && !isAuctionDraft;

  const {
    connected: wsConnected,
    connect: wsConnect,
    disconnect: wsDisconnect,
    reconnectNow: wsReconnectNow,
    suspend: wsSuspend,
    resume: wsResume,
    sendMessage,
  } = useWebSocket({
    url: websocketUrl,
    token,
    draftId: draftId ?? undefined,
    viewContext: 'draft',
    autoConnect: socketExpected,
    heartbeatMs: DRAFT_HEARTBEAT_MS,
    onDraftStarted: handleDraftStarted,
    onDraftPickMade: handleDraftPickMade,
    onDraftPickUndone: handleDraftPickUndone,
    onDraftCompleted: handleDraftCompleted,
    onDraftPaused: handleDraftPaused,
    onDraftResumed: handleDraftResumed,
    onLeagueDeleted: handleLeagueDeleted,
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
      typeof document === 'undefined' ||
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

  // Cancels the in-flight resync's pending retries (if any).
  const cancelResyncRef = useRef<(() => void) | null>(null);
  // When the last resync started — see RESYNC_DEDUPE_MS.
  const lastResyncAtRef = useRef(0);

  /**
   * Re-read everything a client may have missed while its socket was down,
   * suspended or replaced: the reconnect edge below and the app returning to
   * the foreground both call this (LS-10593). Returns a cancel function that
   * stops pending retries (also invoked automatically by the next resync and
   * on unmount).
   */
  const resync = useCallback(
    (reason: 'reconnect' | 'foreground'): (() => void) => {
      const noop = () => undefined;
      if (draftId === null) return noop;

      cancelResyncRef.current?.();
      lastResyncAtRef.current = Date.now();
      LOGGER.info('[useDraftWebSocket] resyncing draft state', {
        reason,
        draftId,
      });

      // A resync that lands during the 300ms pick-notification debounce
      // window must cancel that timer — otherwise both it and the resync
      // below fire their own refetches, doubling network traffic (LDB-031).
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = undefined;
      }
      pendingRefetchNotifRef.current = null;

      let cancelled = false;
      const pendingWaits = new Map<ReturnType<typeof setTimeout>, () => void>();

      // Cancelling resolves pending waits rather than only clearing their
      // timers, so a backoff suspended at unmount resumes once and exits via
      // the `cancelled` check at the top of the retry loop instead of hanging
      // forever.
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            pendingWaits.delete(timer);
            resolve();
          }, ms);
          pendingWaits.set(timer, resolve);
        });

      /**
       * Run one resync refetch, retrying transient failures with
       * exponential backoff. The underlying error is logged as a structured
       * object (not `String(e)`) so `name`/`stack`/Apollo's `graphQLErrors`
       * survive into the Rollbar payload — stringifying it destroyed the
       * cause and bypassed the `AbortError` noise filter in lib/rollbar
       * (LS-8506).
       */
      const refetchWithRetry = async (
        label: string,
        run: () => Promise<unknown>,
      ): Promise<ReconnectRefetchOutcome> => {
        for (
          let attempt = 1;
          attempt <= RECONNECT_REFETCH_ATTEMPTS;
          attempt++
        ) {
          if (cancelled) return 'cancelled';
          try {
            await run();
            return 'ok';
          } catch (error: unknown) {
            if (cancelled || isAbortError(error)) {
              LOGGER.debug(
                `Refetch of ${label} cancelled after websocket ${reason}`,
                { error },
              );
              return 'cancelled';
            }
            if (attempt === RECONNECT_REFETCH_ATTEMPTS) {
              LOGGER.error(
                `Failed to refetch ${label} after websocket ${reason}`,
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
      // connection, but that push is best-effort, so explicitly re-request
      // one here too: userJoined/userLeft events missed while disconnected
      // would otherwise leave presence stale until the next full page mount
      // (LDB-028). Scoped to the draft room (LS-10160).
      // A no-op if the socket isn't open yet; the reconnect edge re-asks.
      sendMessage({ type: 'requestUserList', draftId });

      void refetchWithRetry('current pick', () =>
        refetchCurrentPick({ draftId }),
      );
      void refetchWithRetry('pick history', refetchPickHistory);
      void refetchWithRetry('auto-pick statuses', refetchAutoPickStatuses);
      void refetchWithRetry('draft', refetchDraft);
      // Paused/resumed state is read from the league; a DRAFT_PAUSED /
      // DRAFT_RESUMED event missed while away would otherwise leave the
      // board showing the wrong state (and timer) until a reload (LS-10593).
      void refetchWithRetry('league', refetchLeague);
      // The queue is the server's first auto-pick source (auto-pick-scorer.ts),
      // so a stale queue snapshot can show players already drafted while
      // disconnected (LS-6787).
      void refetchWithRetry('queue', refetchQueue);
      // The available-players list is the one stale-state a user can act on:
      // an out-of-date board lets them try to draft an already-taken player.
      // Warn them explicitly rather than failing silently.
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

      const cancel = () => {
        cancelled = true;
        pendingWaits.forEach((resolve, timer) => {
          clearTimeout(timer);
          resolve();
        });
        pendingWaits.clear();
        if (cancelResyncRef.current === cancel) cancelResyncRef.current = null;
      };
      cancelResyncRef.current = cancel;
      return cancel;
    },
    [
      draftId,
      sendMessage,
      showToast,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchAutoPickStatuses,
      refetchDraft,
      refetchLeague,
      refetchQueue,
    ],
  );

  // Cancel any in-flight resync retries on unmount.
  useEffect(() => {
    return () => {
      cancelResyncRef.current?.();
    };
  }, []);

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

    // A foreground resync just ran (and the edge is the socket it forced
    // coming back) — refetching everything again would only double traffic.
    // Presence is WS-only, though, and the foreground request may have been
    // sent before the new socket opened, so still re-ask for it (LS-10593).
    if (Date.now() - lastResyncAtRef.current < RESYNC_DEDUPE_MS) {
      sendMessage({ type: 'requestUserList', draftId });
      return undefined;
    }

    return resync('reconnect');
  }, [wsConnected, draftId, sendMessage, resync]);

  // Native apps get no browser visibility/online signals, so a minimized
  // app's socket was never revived or resynced on return — the draft board
  // stayed out of sync (missed picks, pauses, picks a commissioner made on
  // the user's behalf) until a manual reload (LS-10593). On foreground:
  // after a long absence force a brand-new socket (the old one is likely a
  // zombie); after a short one just revive a client that gave up retrying.
  // Either way, resync the data now rather than waiting on the socket.
  //
  // While minimized the socket is parked (LS-10625) rather than left to
  // churn: the OS drops or freezes it, and the client's heartbeat/backoff
  // would otherwise keep reconnecting — and burning its attempt budget — in
  // the background. Foreground then resumes it with one clean connect.
  const suspendedForBackgroundRef = useRef(false);
  const handleBackground = useCallback(() => {
    if (!socketExpected) return;
    suspendedForBackgroundRef.current = true;
    wsSuspend();
  }, [socketExpected, wsSuspend]);

  const handleForeground = useCallback(
    (backgroundMs: number) => {
      if (!socketExpected) return;
      LOGGER.info('[useDraftWebSocket] app foregrounded', {
        backgroundMs,
        draftId,
      });
      if (suspendedForBackgroundRef.current) {
        // The parked client holds no socket, so a fresh one is already the
        // "force a brand-new socket" outcome the long-absence branch wants.
        suspendedForBackgroundRef.current = false;
        wsResume();
        // `resume` only acts on a client that was actually parked; if it
        // wasn't (no client yet when the background signal fired), still
        // revive one that gave up. A no-op once connected/connecting.
        wsReconnectNow();
      } else if (backgroundMs > FOREGROUND_FORCE_RECONNECT_MS) {
        wsDisconnect();
        wsConnect();
      } else {
        wsReconnectNow();
      }
      if (Date.now() - lastResyncAtRef.current >= RESYNC_DEDUPE_MS) {
        resync('foreground');
      }
    },
    [
      socketExpected,
      draftId,
      wsConnect,
      wsDisconnect,
      wsReconnectNow,
      wsResume,
      resync,
    ],
  );
  useAppForeground(handleForeground, handleBackground);

  /**
   * Debounced, renderable view of the socket state (LS-9856). The raw
   * `wsConnected` flag flips on every micro-blip; this is what the UI reads.
   */
  const connectionStatus = useDraftConnectionStatus({
    connected: wsConnected,
    enabled: socketExpected,
  });

  /**
   * User-initiated reconnect for the Retry actions. Deliberately a
   * disconnect + connect rather than a bare `connect()`: a zombie socket
   * still reports `readyState === OPEN`, so `connect()` alone would no-op
   * with "Already connected" and the Retry button would do nothing visible —
   * the same trap the BFCache handler above works around.
   */
  const retryConnection = useCallback(() => {
    wsDisconnect();
    wsConnect();
  }, [wsConnect, wsDisconnect]);

  return { wsConnected, connectionStatus, retryConnection } as const;
}
