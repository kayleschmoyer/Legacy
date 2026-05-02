import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
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
  ) => void;
  showToast: (
    text: string,
    type?: 'error' | 'warning' | 'info' | 'success',
  ) => void;
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

        if (pickedPlayer) {
          showAnnouncement(
            pickedPlayer,
            notification.overallPick,
            notification.round,
            notification.pickNumber,
            isMyTeamPick,
            false,
          );
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
      setLiveMessage(
        notification?.pausedAt
          ? `Draft paused at ${new Date(notification.pausedAt).toLocaleTimeString()}`
          : 'Draft has been paused by the commissioner.',
      );
      showToast('Draft paused by commissioner', 'warning');
    },
    [showToast, setDraftPaused, setLiveMessage],
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

  const { connected: wsConnected } = useWebSocket({
    url: websocketUrl,
    token,
    leagueId: leagueId ?? undefined,
    viewContext: 'league',
    autoConnect: !!leagueId && isAuthenticated && !isAuctionDraft,
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

  // Reconnection recovery
  const wsWasConnected = useRef(false);
  useEffect(() => {
    if (wsConnected && wsWasConnected.current && draftId) {
      void refetchCurrentPick({ draftId }).catch((e: unknown) => {
        LOGGER.error(
          'Failed to refetch current pick after websocket reconnect',
          String(e),
        );
      });
      void refetchPickHistory().catch((e: unknown) => {
        LOGGER.error(
          'Failed to refetch pick history after websocket reconnect',
          String(e),
        );
      });
      void refetchAvailablePlayers().catch((e: unknown) => {
        LOGGER.error(
          'Failed to refetch available players after websocket reconnect',
          String(e),
        );
      });
      void refetchAutoPickStatuses().catch((e: unknown) => {
        LOGGER.error(
          'Failed to refetch auto-pick statuses after websocket reconnect',
          String(e),
        );
      });
      void refetchDraft().catch((e: unknown) => {
        LOGGER.error(
          'Failed to refetch draft after websocket reconnect',
          String(e),
        );
      });
    }
    wsWasConnected.current = wsConnected;
  }, [
    wsConnected,
    draftId,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
    refetchAutoPickStatuses,
    refetchDraft,
  ]);

  return { wsConnected } as const;
}
