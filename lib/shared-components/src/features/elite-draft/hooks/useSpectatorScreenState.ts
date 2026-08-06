import { useCallback, useRef, useState } from 'react';
import { useDraftTimer } from './useDraftTimer';
import { useDraftWebSocket } from './useDraftWebSocket';
import { useSpectatorDraftData } from './useSpectatorDraftData';
import { useSplashQueue } from '../SplashQueue';
import { DEFAULT_PICK_TIME } from '../constants';
import type { AvailableDraftPlayer, DraftPlayer } from '../types';
import { useAuth } from '../../../features/auth';

interface UseSpectatorScreenStateParams {
  leagueId: number | null;
  websocketUrl: string;
  /** Auth token override for the WebSocket; falls back to the session token. */
  token?: string;
  /** Hold duration per pick splash — prop-tunable, defaults to ~8s. */
  minSplashMs?: number;
}

/**
 * Shared read-only wiring for the spectator screen (LS-8942, unified in
 * LS-9056): draft data, WebSocket, timer, and splash-queue state — the parts
 * that are identical between `SpectatorScreen.tsx` and
 * `SpectatorScreen.native.tsx`. The two screens still render their own JSX
 * trees (see the header comment on each file for why), but everything they
 * feed off comes from here so that wiring never drifts between platforms
 * again.
 */
export function useSpectatorScreenState({
  leagueId,
  websocketUrl,
  token,
  minSplashMs,
}: UseSpectatorScreenStateParams) {
  const { user, token: authToken } = useAuth();
  const isAuthenticated = !!user;

  const data = useSpectatorDraftData({ leagueId });

  const [draftComplete, setDraftComplete] = useState(false);
  const [draftPaused, setDraftPaused] = useState(false);
  const [pickDeadline, setPickDeadline] = useState<Date | null>(null);
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] =
    useState(DEFAULT_PICK_TIME);
  const [liveMessage, setLiveMessage] = useState('');
  const notifiedPicksRef = useRef<Set<number>>(new Set());

  const splash = useSplashQueue({ minSplashMs });
  const { enqueue, removePick } = splash;

  // Adapter: the WS hook's announcement callback feeds the splash queue.
  // Only live socket events reach this — historical picks are never enqueued.
  const showAnnouncement = useCallback(
    (
      player: DraftPlayer | AvailableDraftPlayer,
      pickNumber: number,
      round: number,
      roundPickNumber: number,
      _myPick: boolean,
      auto: boolean,
      teamName: string,
    ) => {
      enqueue({
        player,
        overallPick: pickNumber,
        round,
        roundPickNumber,
        isAuto: auto,
        teamName,
      });
    },
    [enqueue],
  );

  // Spectators surface no toasts and no presence — quiet no-ops.
  const noop = useCallback(() => undefined, []);
  const asyncNoop = useCallback(() => Promise.resolve(undefined), []);

  useDraftWebSocket({
    leagueId,
    draftId: data.draftId,
    isAuthenticated,
    isAuctionDraft: data.isAuctionDraft,
    myTeamId: null,
    enrichedPlayers: [],
    statsLookup: data.statsLookup,
    teamNameById: data.teamNameById,
    notifiedPicksRef,
    showAnnouncement,
    showToast: noop,
    setDraftComplete,
    setDraftPaused,
    setPickDeadline,
    setPickTimeLimitSeconds,
    setLiveMessage,
    setOnlineUserIds: noop,
    refetchDraft: data.refetchDraft,
    refetchLeague: data.refetchLeague,
    refetchCurrentPick: data.refetchCurrentPick,
    refetchPickHistory: data.refetchPickHistory,
    refetchAvailablePlayers: asyncNoop,
    refetchQueue: asyncNoop,
    refetchAutoPickStatuses: asyncNoop,
    websocketUrl,
    token: token ?? authToken ?? undefined,
    onPickUndone: removePick,
  });

  const { timeRemaining } = useDraftTimer({
    draftId: data.draftId,
    leagueId,
    draftComplete,
    draftOrderMissing: false,
    draftPaused,
    currentPickInfo: data.currentPickInfo,
    pickDeadline,
    leagueDraft: data.leagueDraft,
    setPickDeadline,
    setPickTimeLimitSeconds,
    setAutoPickDisabled: noop,
    readOnly: true,
    refetchDraft: data.refetchDraft,
    refetchCurrentPick: data.refetchCurrentPick,
    refetchPickHistory: data.refetchPickHistory,
    refetchAvailablePlayers: asyncNoop,
  });

  // ---- Derived pick/round state shared by both screens' live layout ----
  const round =
    data.currentPickInfo?.round ??
    Math.ceil(
      (data.currentPickInfo?.overallPick ?? 1) /
        Math.max(data.leagueTeams.length, 1),
    );
  const currentPick =
    data.currentPickInfo?.overallPick ?? data.pickHistory.length + 1;
  const onClockTeamName = data.teamNameById(data.currentPickTeamId);
  const recentPicks = [...data.pickHistory]
    .sort((a, b) => b.overallPick - a.overallPick)
    .slice(0, 5);

  return {
    data,
    draftComplete,
    draftPaused,
    pickDeadline,
    pickTimeLimitSeconds,
    liveMessage,
    splash,
    timeRemaining,
    round,
    currentPick,
    onClockTeamName,
    recentPicks,
  } as const;
}
