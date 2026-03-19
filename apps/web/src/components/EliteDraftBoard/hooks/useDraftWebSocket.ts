import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
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
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import type { AvailableDraftPlayer, DraftPlayer } from '../types';
import { normalizeTeamId } from '../utils';
import { env } from '../../../config/environment';

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
  showToast: (text: string, type?: 'error' | 'warning' | 'info') => void;
  setDraftComplete: (v: boolean) => void;
  setDraftPaused: (v: boolean) => void;
  setPickDeadline: (v: Date | null) => void;
  setPickTimeLimitSeconds: (v: number) => void;
  setLiveMessage: (v: string) => void;
  setOnlineUserIds: Dispatch<SetStateAction<ReadonlySet<number>>>;
  refetchDraft: () => unknown;
  refetchLeague: () => unknown;
  refetchCurrentPick: (vars: { draftId: number }) => unknown;
  refetchPickHistory: () => unknown;
  refetchAvailablePlayers: () => unknown;
  refetchQueue: () => Promise<unknown>;
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
}: UseDraftWebSocketParams) {
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

      void refetchCurrentPick({ draftId: notification.draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
      void refetchQueue().catch((e: unknown) =>
        LOGGER.warn('Queue refetch failed:', String(e)),
      );
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
      refetchQueue,
    ],
  );

  const handleDraftCompleted = useCallback(
    (_notification: DraftCompletedNotification) => {
      setDraftComplete(true);
      setDraftPaused(false);
      setLiveMessage('Draft is complete!');
      void refetchLeague();
    },
    [refetchLeague, setDraftComplete, setDraftPaused, setLiveMessage],
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
    url: env.websocketUrl,
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

  // Reconnection recovery
  const wsWasConnected = useRef(false);
  useEffect(() => {
    if (wsConnected && wsWasConnected.current && draftId) {
      void refetchCurrentPick({ draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
      void refetchDraft();
    }
    wsWasConnected.current = wsConnected;
  }, [
    wsConnected,
    draftId,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
    refetchDraft,
  ]);

  return { wsConnected } as const;
}
