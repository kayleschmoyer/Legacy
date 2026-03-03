import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type DraftCompletedNotification,
  type DraftPausedNotification,
  type DraftPickNotification,
  type DraftResumedNotification,
  type DraftStartedNotification,
  useWebSocket,
} from '@legacy-sports/shared-components';
import { ChatPanel } from '@legacy-sports/shared-components';
import {
  type AvailableDraftPlayer,
  type CurrentDraftPickInfo,
  type DraftPickRecord,
  type DraftPlayer,
  type LeagueTeam,
  type PlayerStatsEntry,
} from './types';
import { DEFAULT_PICK_TIME } from './constants';
import { getPositionColor, normalizeTeamId } from './utils';
import { useBrowserNotifications } from './useBrowserNotifications';
import { CSS } from './styles';
import { CircularTimer } from './CircularTimer';
import { PickAnnouncement } from './PickAnnouncement';
import { PlayerCard } from './PlayerCard';
import { SkeletonCard } from './SkeletonCard';
import { DraftGrid } from './DraftGrid';
import {
  CommissionerPick as COMMISSIONER_PICK,
  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  type GetAvailableDraftPlayersQuery,
  type GetAvailableDraftPlayersQueryVariables,
  type GetCurrentDraftPickQuery,
  type GetCurrentDraftPickQueryVariables,
  type GetDraftPicksQuery,
  type GetDraftPicksQueryVariables,
  InitializeLiveDraft as INITIALIZE_LIVE_DRAFT,
  MakeDraftPick as MAKE_DRAFT_PICK,
  NudgeExpiredDraftPick as NUDGE_EXPIRED_DRAFT_PICK,
  PauseDraft as PAUSE_DRAFT,
  ResumeDraft as RESUME_DRAFT,
} from '../../api/db/graphql.generated';
import { env } from '../../config/environment';

// ===========================================================================
// Main Component
// ===========================================================================

export function EliteDraftBoardScreen(): React.JSX.Element {
  // ---- Routing ----
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;

  // ---- UI State ----
  const [selectedPosition, setSelectedPosition] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<
    'grid' | 'list' | 'compact' | 'board'
  >('grid');
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [draftPaused, setDraftPaused] = useState(false);
  // Authoritative pick deadline and time limit synced from server (WS + query)
  const [pickDeadline, setPickDeadline] = useState<Date | null>(null);
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] =
    useState(DEFAULT_PICK_TIME);
  const [commPickMode, setCommPickMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'error' | 'warning' | 'info';
  } | null>(null);

  // Pick announcement
  const [announcement, setAnnouncement] = useState<{
    player: DraftPlayer | AvailableDraftPlayer;
    pickNumber: number;
    isMyPick: boolean;
    isAuto: boolean;
  } | null>(null);
  const [announcementLeaving, setAnnouncementLeaving] = useState(false);
  const announcementTimerRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const showAnnouncement = useCallback(
    (
      player: DraftPlayer | AvailableDraftPlayer,
      pickNumber: number,
      myPick: boolean,
      auto: boolean,
    ) => {
      if (announcementTimerRef.current)
        clearTimeout(announcementTimerRef.current);
      setAnnouncementLeaving(false);
      setAnnouncement({ player, pickNumber, isMyPick: myPick, isAuto: auto });
      announcementTimerRef.current = setTimeout(() => {
        setAnnouncementLeaving(true);
        setTimeout(() => {
          setAnnouncement(null);
          setAnnouncementLeaving(false);
        }, 400);
      }, 3200);
    },
    [],
  );

  // Screen reader live regions
  const [liveMessage, setLiveMessage] = useState('');
  const [urgentMessage, setUrgentMessage] = useState('');

  // ---- Browser notifications ----
  const { notify } = useBrowserNotifications();

  // Toast auto-dismiss
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const showToast = useCallback(
    (text: string, type: 'error' | 'warning' | 'info' = 'error') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage({ text, type });
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 5000);
    },
    [],
  );

  const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];
  const viewModes: Array<'grid' | 'list' | 'compact' | 'board'> = [
    'grid',
    'list',
    'compact',
    'board',
  ];

  // ---- Auth ----
  const token = useMemo(() => {
    try {
      return typeof localStorage !== 'undefined'
        ? localStorage.getItem('auth_jwt')
        : null;
    } catch {
      return null;
    }
  }, []);

  // ---- League Data ----
  const {
    data: leagueData,
    loading: leagueLoading,
    refetch: refetchLeague,
  } = useQuery(GET_LEAGUE_BY_ID, {
    variables: { id: leagueId },
    skip: !leagueId,
  });

  const { data: teamsData } = useQuery(GET_LEAGUE_TEAMS, {
    variables: { leagueId },
    skip: !leagueId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league = (leagueData as any)?.league;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueTeams: LeagueTeam[] = (teamsData as any)?.leagueTeams ?? [];
  const permLevel = league?.userMembership?.permissionLevel as
    | string
    | undefined;
  const isOwner =
    permLevel === 'owner' ||
    permLevel === 'commissioner' ||
    permLevel === 'general_manager';
  const isCommissioner = permLevel === 'owner' || permLevel === 'commissioner';
  const myTeamId = normalizeTeamId(league?.userMembership?.teamId);

  // Helper: resolve team name from leagueTeams by numeric ID
  const teamNameById = useCallback(
    (teamId: number | null | undefined): string => {
      if (teamId == null) return 'Unknown Team';
      const t = leagueTeams.find((lt) => String(lt.id) === String(teamId));
      return t?.name ?? `Team #${teamId}`;
    },
    [leagueTeams],
  );

  // ---- Draft Data ----
  const {
    data: draftData,
    error: draftError,
    refetch: refetchDraft,
  } = useQuery(GET_LEAGUE_DRAFT, {
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  // Derive draftId directly from the league query (keyed off leagueId in the URL)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueDraft = (draftData as any)?.getLeagueDraft;
  const draftId: number | null = leagueDraft?.id
    ? Number(leagueDraft.id)
    : null;

  // Log draft errors (debug logging removed for production)
  useEffect(() => {
    if (draftError) console.error('[Draft] getLeagueDraft error:', draftError);
  }, [draftError]);

  // Mark draft complete when server data indicates it
  useEffect(() => {
    if (leagueDraft?.draftCompletedAt) {
      setDraftComplete(true);
    }
  }, [leagueDraft?.draftCompletedAt]);

  // Detect paused status from league data
  useEffect(() => {
    if (league?.draftStatus === 'paused') {
      setDraftPaused(true);
    } else if (league?.draftStatus === 'in-progress') {
      setDraftPaused(false);
    }
  }, [league?.draftStatus]);

  // ---- Current Pick ----
  const [draftOrderMissing, setDraftOrderMissing] = useState(false);
  const {
    data: currentPickData,
    error: currentPickError,
    refetch: refetchCurrentPick,
  } = useQuery<GetCurrentDraftPickQuery, GetCurrentDraftPickQueryVariables>(
    GET_CURRENT_DRAFT_PICK,
    {
      variables: { draftId: draftId ?? 0 },
      skip: !draftId,
      pollInterval: !draftId || draftOrderMissing ? 0 : 5000, // Poll every 5s as a fallback to WebSocket
      errorPolicy: 'all',
    },
  );

  const currentPickInfo: CurrentDraftPickInfo | null =
    (currentPickData?.getCurrentDraftPick ??
      null) as unknown as CurrentDraftPickInfo | null;
  const currentPickTeamId = normalizeTeamId(currentPickInfo?.teamId);
  const isMyPick = Boolean(
    currentPickInfo &&
    currentPickTeamId !== null &&
    myTeamId !== null &&
    currentPickTeamId === myTeamId &&
    !currentPickInfo.isComplete,
  );

  const currentPickErrorMessage = currentPickError?.message ?? '';

  // Draft/pick diagnostics
  useEffect(() => {
    if (!currentPickErrorMessage) return;

    if (
      currentPickErrorMessage.includes('No teams configured for this draft')
    ) {
      setDraftOrderMissing(true);
      setInitError(
        'Draft order has not been generated yet. Re-start the live draft to assign teams to draft slots.',
      );
      setUrgentMessage('');
      return;
    }

    setDraftOrderMissing(false);
  }, [currentPickErrorMessage]);

  useEffect(() => {
    if (currentPickInfo) {
      setDraftOrderMissing(false);
      setInitError(null);
    }
  }, [currentPickInfo]);

  // ---- Pick History ----
  const { data: picksData, refetch: refetchPickHistory } = useQuery<
    GetDraftPicksQuery,
    GetDraftPicksQueryVariables
  >(GET_DRAFT_PICKS, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId,
  });

  const pickHistory: DraftPickRecord[] = (picksData?.getDraftPicks ??
    []) as unknown as DraftPickRecord[];

  // ---- Available Players (server-side search) ----
  const [playerSearch, setPlayerSearch] = useState('');
  const {
    data: availablePlayersData,
    loading: availablePlayersLoading,
    error: availablePlayersError,
    refetch: refetchAvailablePlayers,
  } = useQuery<
    GetAvailableDraftPlayersQuery,
    GetAvailableDraftPlayersQueryVariables
  >(GET_AVAILABLE_DRAFT_PLAYERS, {
    variables: {
      draftId: draftId ?? 0,
      search: playerSearch || null,
      position: selectedPosition !== 'ALL' ? selectedPosition : null,
      orderBy:
        selectedPosition === 'P'
          ? 'pitchingAvgPointsPerGame'
          : 'hitterAvgPointsPerGame',
      limit: 200,
    },
    skip: !draftId,
    errorPolicy: 'all',
  });

  const availablePlayers: AvailableDraftPlayer[] = (
    availablePlayersData?.getAvailableDraftPlayers ?? []
  )
    .filter(
      (
        p,
      ): p is {
        id: number;
        firstName: string;
        lastName: string;
        brefId: string;
      } =>
        p.id != null &&
        p.firstName != null &&
        p.lastName != null &&
        p.brefId != null,
    )
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      brefId: p.brefId,
    }));

  // ---- Career Batting Stats (uses existing careerBattingStats connection) ----
  const { data: statsData } = useQuery(GET_DRAFT_PLAYER_STATS, {
    variables: { first: 5000, minGames: 1 },
    errorPolicy: 'all',
  });

  // Build a playerId → stats map from the careerBattingStats connection
  const playerStatsMap = useMemo(() => {
    const map = new Map<number, PlayerStatsEntry>();
    const edges = (statsData as Record<string, unknown>)?.careerBattingStats as
      | { edges?: Array<{ node?: Record<string, unknown> } | null> | null }
      | undefined;
    if (!edges?.edges) return map;
    for (const edge of edges.edges) {
      if (!edge?.node) continue;
      const n = edge.node;
      const pid = n.playerId as number | null | undefined;
      if (pid == null) continue;
      const playerObj = n.player as
        | { id?: number; firstName?: string; lastName?: string }
        | null
        | undefined;
      map.set(pid, {
        playerId: pid,
        firstName: (playerObj?.firstName as string) ?? '',
        lastName: (playerObj?.lastName as string) ?? '',
        position: (n.primaryPosition as string) ?? 'UTIL',
        games: (n.games as number) ?? 0,
        hits: (n.hits as number) ?? 0,
        hr: (n.homeRuns as number) ?? 0,
        rbi: (n.rbi as number) ?? 0,
        runs: (n.runs as number) ?? 0,
        sb: (n.stolenBases as number) ?? 0,
        avg: (n.battingAverage as number) ?? 0,
        obp: (n.onBasePercentage as number) ?? 0,
        slg: (n.sluggingPercentage as number) ?? 0,
        war: (n.offensiveWAR as number) ?? 0,
      });
    }
    return map;
  }, [statsData]);

  // Debounced search for available players
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPlayerSearch(searchTerm.trim());
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm]);

  // Build a lookup map by player ID for displaying player names in history/board.
  // Includes ALL players from stats (not just available), so drafted players
  // still appear with their real name instead of "Player #123".
  const statsLookup = useMemo(() => {
    const map = new Map<number, DraftPlayer>();
    // Seed from playerStatsMap (covers both drafted and available players)
    for (const [pid, s] of playerStatsMap) {
      map.set(pid, {
        id: pid,
        name: `${s.firstName} ${s.lastName}`.trim() || `Player #${pid}`,
        position: s.position,
        avg: s.avg,
        hr: s.hr,
        rbi: s.rbi,
        runs: s.runs,
        sb: s.sb,
        games: s.games,
        hits: s.hits,
        obp: s.obp,
        slg: s.slg,
      });
    }
    // Override with available players (which have authoritative firstName/lastName)
    for (const ap of availablePlayers) {
      const s = playerStatsMap.get(ap.id);
      map.set(ap.id, {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: s?.position ?? 'UTIL',
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
      });
    }
    return map;
  }, [availablePlayers, playerStatsMap]);

  // Merge available players with stats data for rich card display
  const enrichedPlayers: DraftPlayer[] = useMemo(() => {
    return availablePlayers.map((ap) => {
      const s = playerStatsMap.get(ap.id);
      return {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: s?.position ?? 'UTIL',
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
      };
    });
  }, [availablePlayers, playerStatsMap]);

  // Position filtering is handled server-side via the position query variable.
  // enrichedPlayers already contains only the players matching the selected position.
  const filteredPlayers = enrichedPlayers;

  // ---- Mutations ----
  const [initializeLiveDraft, { loading: initDraftLoading }] = useMutation(
    INITIALIZE_LIVE_DRAFT,
  );
  const [makeDraftPick, { loading: pickLoading }] =
    useMutation(MAKE_DRAFT_PICK);
  const [pauseDraftMutation, { loading: pauseLoading }] =
    useMutation(PAUSE_DRAFT);
  const [resumeDraftMutation, { loading: resumeLoading }] =
    useMutation(RESUME_DRAFT);
  const [commissionerPickMutation, { loading: commPickLoading }] =
    useMutation(COMMISSIONER_PICK);
  const [nudgeExpiredDraftPick] = useMutation(NUDGE_EXPIRED_DRAFT_PICK);

  // ---- WebSocket ----
  const handleDraftStarted = useCallback(
    (notification: DraftStartedNotification) => {
      setLiveMessage('Draft has started!');
      notify('🏈 Draft has started!', {
        body: 'Get ready — your league draft is live.',
        tag: 'draft-started',
      });
      if (notification.pickTimeLimitSeconds) {
        setPickTimeLimitSeconds(notification.pickTimeLimitSeconds);
      }
      if (notification.currentPickDeadline) {
        setPickDeadline(new Date(notification.currentPickDeadline));
      }
      void refetchDraft();
      void refetchCurrentPick({ draftId: notification.draftId });
    },
    [notify, refetchDraft, refetchCurrentPick],
  );

  const handleDraftPickMade = useCallback(
    (notification: DraftPickNotification) => {
      const pickTeamId = normalizeTeamId(notification.teamId);
      const isMyTeamPick = pickTeamId !== null && pickTeamId === myTeamId;
      // Find the player in our list for announcements
      const pickedPlayer = enrichedPlayers.find(
        (p) => p.id === notification.playerId,
      );
      if (pickedPlayer) {
        showAnnouncement(
          pickedPlayer,
          notification.overallPick,
          isMyTeamPick,
          false,
        );
      }
      setLiveMessage(
        `Pick #${notification.overallPick}: Round ${notification.round}, Pick ${notification.pickNumber}`,
      );

      // Use nextPick info from notification if available
      if (notification.nextPick) {
        const nextTeamIdRaw = notification.nextPick.teamId;
        const nextTeamId = normalizeTeamId(
          typeof nextTeamIdRaw === 'number'
            ? nextTeamIdRaw
            : Number(nextTeamIdRaw),
        );
        if (nextTeamId !== null && nextTeamId === myTeamId) {
          showToast('🎯 Your turn to pick!', 'info');
          notify('🎯 Your turn to pick!', {
            body: `Round ${notification.nextPick.round ?? ''} — you're on the clock. Head back to make your pick.`,
            tag: 'draft-your-turn',
            requireInteraction: true,
          });
        }
      } else if (!notification.nextPick) {
        // No nextPick means draft may be complete
        setDraftComplete(true);
      }

      // Sync deadline for the next pick's timer
      if (notification.currentPickDeadline) {
        setPickDeadline(new Date(notification.currentPickDeadline));
      }

      void refetchCurrentPick({ draftId: notification.draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
    },
    [
      myTeamId,
      notify,
      enrichedPlayers,
      showAnnouncement,
      showToast,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
    ],
  );

  const handleDraftCompleted = useCallback(
    (_notification: DraftCompletedNotification) => {
      setDraftComplete(true);
      setDraftPaused(false);
      setLiveMessage('Draft is complete!');
      notify('✅ Draft complete!', {
        body: 'Your league draft has finished. Check out your roster!',
        tag: 'draft-complete',
      });
      void refetchLeague();
    },
    [notify, refetchLeague],
  );

  const handleDraftPaused = useCallback(
    (notification?: DraftPausedNotification) => {
      setDraftPaused(true);
      setLiveMessage(
        notification?.pausedAt
          ? `Draft paused at ${new Date(notification.pausedAt).toLocaleTimeString()}`
          : 'Draft has been paused by the commissioner.',
      );
      showToast('⏸️ Draft paused by commissioner', 'warning');
    },
    [showToast],
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
      showToast('▶️ Draft resumed!', 'info');
      if (draftId) void refetchCurrentPick({ draftId });
    },
    [draftId, showToast, refetchCurrentPick],
  );

  const { connected: wsConnected } = useWebSocket({
    url: env.websocketUrl,
    leagueId: leagueId ?? undefined,
    token: token ?? undefined,
    viewContext: 'league',
    autoConnect: !!leagueId && !!token,
    onDraftStarted: handleDraftStarted,
    onDraftPickMade: handleDraftPickMade,
    onDraftCompleted: handleDraftCompleted,
    onDraftPaused: handleDraftPaused,
    onDraftResumed: handleDraftResumed,
  });

  // ---- WebSocket reconnection recovery (docs §8) ----
  // When WS reconnects after a disconnect, refetch critical state to
  // reconcile any picks/events missed while disconnected.
  const wsWasConnected = useRef(false);
  useEffect(() => {
    if (wsConnected && wsWasConnected.current && draftId) {
      // Reconnected — reconcile missed events
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

  // ---- Draft Actions ----
  const handleInitializeDraft = useCallback(
    async (
      draftOrder: 'snake' | 'linear' = 'snake',
      draftMode: 'live' | 'automated' = 'live',
      selectionMethod: 'standard' | 'auction' | 'random' = 'standard',
    ) => {
      if (!leagueId) return;
      setInitError(null);
      try {
        const result = await initializeLiveDraft({
          variables: { leagueId, draftOrder, draftMode, selectionMethod },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = (result.data as any)?.initializeDraft;
        if (draft?.id) {
          const newDraftId = Number(draft.id);
          setDraftOrderMissing(false);
          setInitError(null);
          void refetchDraft();
          void refetchLeague();
          void refetchCurrentPick({ draftId: newDraftId });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to initialize draft';
        setInitError(msg);
      }
    },
    [
      leagueId,
      initializeLiveDraft,
      refetchDraft,
      refetchLeague,
      refetchCurrentPick,
    ],
  );

  const handleMakePick = useCallback(
    async (playerId: number, isAutoPick = false) => {
      if (!draftId || !isMyPick || pickLoading || draftPaused) return;
      try {
        setUrgentMessage('');
        await makeDraftPick({
          variables: { draftId, playerId },
        });
        // WebSocket event will handle UI updates for all clients
        void refetchCurrentPick({ draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to make pick';
        // Handle specific error cases per the integration guide
        if (msg.includes('Player has already been drafted')) {
          showToast('Player already drafted — refreshing list', 'warning');
          void refetchAvailablePlayers();
        } else if (
          msg.includes('not your turn') ||
          msg.includes('Not authorized')
        ) {
          showToast('Not your turn to pick', 'warning');
          void refetchCurrentPick({ draftId });
        } else if (msg.includes('paused')) {
          showToast('Draft is currently paused', 'warning');
          setDraftPaused(true);
        } else if (msg.includes('not in progress')) {
          showToast('Draft is not in progress', 'error');
          void refetchLeague();
        } else if (
          msg.includes('roster is full') ||
          msg.includes('Team roster is full')
        ) {
          showToast('Your roster is full!', 'error');
        } else if (msg.includes('player pool')) {
          showToast('Player is not in the allowed player pool', 'warning');
          void refetchAvailablePlayers();
        } else {
          setUrgentMessage(
            isAutoPick
              ? `Auto-pick failed: ${msg}`
              : `Draft pick failed: ${msg}`,
          );
        }
      }
    },
    [
      draftId,
      isMyPick,
      pickLoading,
      draftPaused,
      makeDraftPick,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchLeague,
      showToast,
    ],
  );

  // ---- Pause/Resume Draft ----
  const handlePauseDraft = useCallback(async () => {
    if (!leagueId || pauseLoading) return;
    try {
      await pauseDraftMutation({ variables: { leagueId } });
      setDraftPaused(true);
      void refetchLeague();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pause draft';
      showToast(msg, 'error');
    }
  }, [leagueId, pauseLoading, pauseDraftMutation, refetchLeague, showToast]);

  const handleResumeDraft = useCallback(async () => {
    if (!leagueId || resumeLoading) return;
    try {
      await resumeDraftMutation({ variables: { leagueId } });
      setDraftPaused(false);
      void refetchLeague();
      if (draftId) void refetchCurrentPick({ draftId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume draft';
      showToast(msg, 'error');
    }
  }, [
    leagueId,
    draftId,
    resumeLoading,
    resumeDraftMutation,
    refetchLeague,
    refetchCurrentPick,
    showToast,
  ]);

  // ---- Commissioner Pick ----
  const handleCommissionerPick = useCallback(
    async (playerId: number) => {
      if (!draftId || commPickLoading) return;
      try {
        await commissionerPickMutation({
          variables: { draftId, playerId },
        });
        setCommPickMode(false);
        void refetchCurrentPick({ draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Commissioner pick failed';
        if (msg.includes('Player has already been drafted')) {
          showToast('Player already drafted — refreshing list', 'warning');
          void refetchAvailablePlayers();
        } else {
          showToast(msg, 'error');
        }
      }
    },
    [
      draftId,
      commPickLoading,
      commissionerPickMutation,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      showToast,
    ],
  );

  // ---- Timer (client-side countdown for UX, not authoritative) ----
  // timeRemaining is computed from the server-assigned pickDeadline so it
  // stays accurate even after WS reconnects or page refresh.
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Sync deadline + time-limit from query result whenever the draft updates.
  // leagueDraft.currentPickDeadline is authoritative and is updated on the
  // server each time a new pick begins (or after resume).
  useEffect(() => {
    if (leagueDraft?.pickTimeLimitSeconds != null) {
      setPickTimeLimitSeconds(leagueDraft.pickTimeLimitSeconds as number);
    }
    if (leagueDraft?.currentPickDeadline) {
      setPickDeadline(new Date(leagueDraft.currentPickDeadline as string));
    }
  }, [leagueDraft?.currentPickDeadline, leagueDraft?.pickTimeLimitSeconds]);

  useEffect(() => {
    if (
      !draftId ||
      draftComplete ||
      draftOrderMissing ||
      draftPaused ||
      !currentPickInfo ||
      currentPickInfo.isComplete
    ) {
      return;
    }
    const tick = () => {
      if (pickDeadline) {
        const secs = Math.max(
          0,
          Math.round((pickDeadline.getTime() - Date.now()) / 1000),
        );
        setTimeRemaining(secs);
      }
    };
    tick(); // run immediately so the display is correct before the first interval
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [
    draftId,
    draftComplete,
    draftOrderMissing,
    currentPickInfo,
    draftPaused,
    pickDeadline,
  ]);

  // ---- Server-side auto-pick nudge (any connected client) ----
  // When the timer expires, nudge the server to process the expired deadline.
  // The mutation is idempotent — concurrent calls from multiple clients are
  // harmless (FOR UPDATE + deadline re-check guards against duplicates).
  // A 2-second grace period avoids needlessly nudging when a WS notification
  // for a just-completed pick is already in-flight.
  const nudgeAttemptRef = useRef<number | null>(null);
  useEffect(() => {
    nudgeAttemptRef.current = null;
  }, [currentPickInfo?.overallPick]);

  useEffect(() => {
    if (!leagueId || !draftId || draftComplete || draftPaused) return;
    if (timeRemaining > 0) return;

    const pickNumber = currentPickInfo?.overallPick ?? null;
    if (pickNumber === null || nudgeAttemptRef.current === pickNumber) return;

    // Wait a short grace period before nudging (the active drafter's client
    // or a just-in-time manual pick may resolve it first).
    const timer = setTimeout(() => {
      // Double-check the pick hasn't advanced while we waited
      if (nudgeAttemptRef.current === pickNumber) return;
      nudgeAttemptRef.current = pickNumber;
      void nudgeExpiredDraftPick({ variables: { leagueId } }).catch(() => {
        // Swallow errors — the nudge is best-effort; EventBridge is the
        // fallback and the server is the source of truth.
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    leagueId,
    draftId,
    draftComplete,
    draftPaused,
    timeRemaining,
    currentPickInfo?.overallPick,
    nudgeExpiredDraftPick,
  ]);

  // ---- A11y announcements ----
  useEffect(() => {
    if (currentPickInfo) {
      if (isMyPick) {
        setLiveMessage(
          `It's your turn to pick! Round ${currentPickInfo.round}, Pick ${currentPickInfo.pickNumber}.`,
        );
      } else {
        setLiveMessage(
          `Waiting for ${teamNameById(currentPickTeamId)} to pick.`,
        );
      }
    } else if (draftOrderMissing) {
      setLiveMessage(
        'Draft order is still being prepared. Waiting for the commissioner to start the pick order.',
      );
    }
  }, [
    currentPickInfo,
    isMyPick,
    draftOrderMissing,
    currentPickTeamId,
    teamNameById,
  ]);

  // =========================================================================
  // Render helpers
  // =========================================================================

  const round =
    currentPickInfo?.round ??
    Math.ceil(
      (currentPickInfo?.overallPick ?? 1) / Math.max(leagueTeams.length, 1),
    );
  const currentPick = currentPickInfo?.overallPick ?? pickHistory.length + 1;

  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  // My team picks from history
  const myTeamPicks = useMemo(
    () => pickHistory.filter((p) => p.teamId === myTeamId),
    [pickHistory, myTeamId],
  );

  // My drafted players mapped to DraftPlayer for roster display
  const myTeam: DraftPlayer[] = useMemo(
    () =>
      myTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        return {
          id: pick.playerId,
          name: `Player #${pick.playerId}`,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [myTeamPicks, statsLookup],
  );

  // =========================================================================
  // No leagueId — show prompt
  // =========================================================================

  if (!leagueId) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="baseball">
              ⚾
            </span>
          </div>
          <div className="d-state-title">Live Draft Board</div>
          <div className="d-state-desc">
            Navigate to a league and start a live draft from the commissioner
            panel.
          </div>
          <button className="d-state-btn" onClick={() => navigate('/baseball')}>
            Go to Leagues
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Loading
  // =========================================================================

  if (
    (leagueLoading || availablePlayersLoading) &&
    !availablePlayersData &&
    !leagueData
  ) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-skeleton-wrap">
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid rgba(197, 165, 90, 0.2)',
                borderTopColor: '#C5A55A',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--d-text-secondary)',
              }}
            >
              Loading draft board...
            </div>
          </div>
          <div className="d-skeleton-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Error
  // =========================================================================

  if (availablePlayersError) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="warning">
              ⚠️
            </span>
          </div>
          <div className="d-state-title">Failed to Load Players</div>
          <div className="d-state-desc">
            {availablePlayersError.message ||
              'An error occurred while fetching player data.'}
          </div>
          <button
            className="d-state-btn"
            onClick={() => {
              void refetchAvailablePlayers();
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Draft Complete
  // =========================================================================

  if (draftComplete || currentPickInfo?.isComplete) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="trophy">
              🏆
            </span>
          </div>
          <div className="d-state-title">Draft Complete!</div>
          <div className="d-state-desc">
            All {pickHistory.length} picks have been made. Your roster is set!
          </div>
          {myTeam.length > 0 && (
            <div style={{ maxWidth: 400, width: '100%', marginTop: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: 'var(--d-accent)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Your Roster ({myTeam.length} players)
              </div>
              {myTeam.map((p) => (
                <div key={p.id} className="d-roster-player">
                  <div>
                    <div
                      style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--d-text-muted)' }}>
                      {p.position}
                    </div>
                  </div>
                  <span
                    style={{
                      background: getPositionColor(p.position),
                      padding: '2px 6px',
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                    }}
                  >
                    {p.position}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            className="d-state-btn"
            onClick={() => navigate(`/baseball/league/${leagueId}`)}
          >
            Back to League
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Pre-Draft Lobby (draft not started yet)
  // =========================================================================

  const draftStatus = league?.draftStatus;

  if (!draftId && draftStatus !== 'in-progress') {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="baseball">
              ⚾
            </span>
          </div>
          <div className="d-state-title">
            {league?.name ? `${league.name} — Live Draft` : 'Live Draft Lobby'}
          </div>
          <div className="d-state-desc">
            {leagueTeams.length < 2
              ? 'At least 2 teams are required to start a draft. Invite more teams to your league.'
              : isOwner
                ? 'As a league manager, you can start the live draft when all teams are ready.'
                : 'Waiting for the commissioner to start the live draft.'}
          </div>

          {/* Team list */}
          {leagueTeams.length > 0 && (
            <div style={{ maxWidth: 320, width: '100%', marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: 'var(--d-text-secondary)',
                  marginBottom: 8,
                }}
              >
                Teams ({leagueTeams.length})
              </div>
              {leagueTeams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--d-surface)',
                    border: '1px solid var(--d-border)',
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    color:
                      String(team.id) === String(myTeamId)
                        ? 'var(--d-accent)'
                        : 'var(--d-text)',
                  }}
                >
                  {team.name}{' '}
                  {String(team.id) === String(myTeamId) ? '(You)' : ''}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {initError && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: '#ef4444',
                fontSize: 13,
                maxWidth: 400,
              }}
            >
              {initError}
            </div>
          )}

          {/* Start Draft button (owner only) */}
          {isOwner && leagueTeams.length >= 2 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="d-state-btn"
                onClick={() => {
                  void handleInitializeDraft('snake');
                }}
                disabled={initDraftLoading}
                style={{ opacity: initDraftLoading ? 0.6 : 1 }}
              >
                {initDraftLoading ? '⏳ Starting...' : '🐍 Start Snake Draft'}
              </button>
              <button
                className="d-state-btn"
                onClick={() => {
                  void handleInitializeDraft('linear');
                }}
                disabled={initDraftLoading}
                style={{
                  opacity: initDraftLoading ? 0.6 : 1,
                  background:
                    'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                }}
              >
                {initDraftLoading ? '⏳ Starting...' : '📋 Start Normal Draft'}
              </button>
            </div>
          )}

          {!isOwner && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 8,
                color: '#60a5fa',
                fontSize: 13,
              }}
            >
              You'll be notified when the commissioner starts the draft.
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // Main Live Draft UI
  // =========================================================================

  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />

      <div className="d-layout">
        {/* ============================================================== */}
        {/* LEFT SIDEBAR                                                    */}
        {/* ============================================================== */}
        <aside
          className="d-side d-side-l"
          aria-label="My team and draft controls"
        >
          {/* Draft status */}
          <div
            className="d-status"
            style={
              draftPaused
                ? {
                    background:
                      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  }
                : undefined
            }
          >
            <span
              className="d-live-dot"
              style={
                draftPaused ? { animation: 'none', opacity: 0.5 } : undefined
              }
            />
            <div className="d-status-info">
              <div className="d-status-title">
                {draftPaused ? (
                  <>
                    <span role="img" aria-label="paused">
                      ⏸️
                    </span>{' '}
                    DRAFT PAUSED
                  </>
                ) : (
                  'LIVE DRAFT'
                )}
              </div>
              <div className="d-status-sub">
                Pick #{currentPick} &middot; Round {round}
              </div>
            </div>
          </div>

          {/* Timer */}
          {!draftPaused && (
            <CircularTimer
              seconds={timeRemaining}
              isMyPick={isMyPick}
              pickTimeLimitSeconds={pickTimeLimitSeconds}
            />
          )}
          {draftPaused && (
            <div
              style={{
                textAlign: 'center',
                padding: '16px 0',
                marginBottom: 20,
                color: '#f59e0b',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span role="img" aria-label="paused">
                ⏸️
              </span>{' '}
              Timer paused
            </div>
          )}

          {/* Commissioner Controls */}
          {isCommissioner && draftId && (
            <div className="d-comm-controls">
              <div className="d-comm-title">
                <span role="img" aria-label="crown">
                  👑
                </span>{' '}
                Commissioner
              </div>
              {!draftPaused ? (
                <button
                  className="d-comm-btn danger"
                  onClick={() => void handlePauseDraft()}
                  disabled={pauseLoading}
                >
                  {pauseLoading ? '⏳ Pausing...' : '⏸ Pause Draft'}
                </button>
              ) : (
                <button
                  className="d-comm-btn success"
                  onClick={() => void handleResumeDraft()}
                  disabled={resumeLoading}
                >
                  {resumeLoading ? '⏳ Resuming...' : '▶ Resume Draft'}
                </button>
              )}
              <button
                className={`d-comm-btn${commPickMode ? ' success' : ''}`}
                onClick={() => setCommPickMode(!commPickMode)}
                disabled={commPickLoading}
              >
                {commPickMode
                  ? '✓ Commissioner Pick ON'
                  : '👤 Commissioner Pick'}
              </button>
              {commPickMode && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#a78bfa',
                    margin: '-2px 0 4px',
                    padding: '4px 8px',
                    background: 'rgba(139,92,246,0.08)',
                    borderRadius: 4,
                  }}
                >
                  Click any player&apos;s Draft button to pick on behalf of the
                  current team
                </div>
              )}
            </div>
          )}

          {/* Whose Turn */}
          {currentPickInfo ? (
            <div className="d-panel" style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  color: isMyPick
                    ? 'var(--d-success)'
                    : 'var(--d-text-secondary)',
                }}
              >
                {isMyPick ? '🎯 YOUR PICK' : '⏳ ON THE CLOCK'}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: isMyPick ? '#10b981' : '#f1f5f9',
                }}
              >
                {teamNameById(currentPickTeamId)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--d-text-muted)',
                  marginTop: 4,
                }}
              >
                Round {currentPickInfo.round} &middot; Pick{' '}
                {currentPickInfo.pickNumber}
              </div>
              {/* Diagnostic — explains why button is or isn't active */}
              {myTeamId === null && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#f87171',
                    lineHeight: 1.4,
                  }}
                >
                  <span role="img" aria-label="Warning">
                    ⚠️
                  </span>{' '}
                  Your league membership has no team assigned. Commissioner Pick
                  can be used as a workaround.
                </div>
              )}
              {myTeamId !== null &&
                !isMyPick &&
                !currentPickInfo.isComplete && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 10,
                      color: 'var(--d-text-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    Your team ID: {myTeamId} &middot; On clock:{' '}
                    {currentPickTeamId}
                  </div>
                )}
            </div>
          ) : (
            <div className="d-panel" style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  color: 'var(--d-warning)',
                }}
              >
                Draft Order Pending
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                Waiting for pick order setup
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--d-text-muted)',
                  marginTop: 6,
                }}
              >
                We can&apos;t determine whose turn it is yet.
              </div>
              {isOwner && pickHistory.length === 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <button
                    className="d-state-btn"
                    onClick={() => {
                      void handleInitializeDraft('snake');
                    }}
                    disabled={initDraftLoading}
                    style={{ opacity: initDraftLoading ? 0.6 : 1 }}
                  >
                    {initDraftLoading ? 'Starting...' : 'Generate Snake Order'}
                  </button>
                  <button
                    className="d-state-btn"
                    onClick={() => {
                      void handleInitializeDraft('linear');
                    }}
                    disabled={initDraftLoading}
                    style={{
                      opacity: initDraftLoading ? 0.6 : 1,
                      background:
                        'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                    }}
                  >
                    {initDraftLoading ? 'Starting...' : 'Generate Linear Order'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* My Roster */}
          <div className="d-panel">
            <h3 className="d-panel-title a-orange" id="my-roster-heading">
              <span role="img" aria-label="trophy">
                🏆
              </span>{' '}
              MY ROSTER ({myTeam.length})
            </h3>

            {/* Position needs */}
            <div className="d-roster-grid">
              {['C', '1B', '2B', '3B', 'SS', 'OF'].map((pos) => {
                const count = myTeam.filter((p) => p.position === pos).length;
                return (
                  <div className="d-roster-cell" key={pos}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: getPositionColor(pos),
                        borderRadius: 4,
                        padding: '1px 5px',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: 3,
                      }}
                    >
                      {pos}
                    </span>
                    <div
                      style={{
                        fontWeight: 600,
                        color: count > 0 ? '#10b981' : 'var(--d-text-muted)',
                      }}
                    >
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Drafted list */}
            {myTeam.length > 0 ? (
              <div
                role="region"
                aria-labelledby="my-roster-heading"
                style={{ maxHeight: 260, overflowY: 'auto' }}
              >
                <div role="list">
                  {myTeam.map((p) => (
                    <div className="d-roster-player" role="listitem" key={p.id}>
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#fff',
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--d-text-muted)',
                          }}
                        >
                          {p.position} &middot; {p.games} G
                        </div>
                      </div>
                      <span
                        style={{
                          background: getPositionColor(p.position),
                          padding: '2px 6px',
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {p.position}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 12px',
                  color: 'var(--d-text-muted)',
                  fontSize: 13,
                }}
              >
                Draft players to build your roster
              </div>
            )}
          </div>

          {/* Pick History */}
          {pickHistory.length > 0 && (
            <div className="d-panel">
              <h3 className="d-panel-title a-green" id="pick-history-heading">
                <span role="img" aria-label="clipboard">
                  📋
                </span>{' '}
                PICK HISTORY ({pickHistory.length})
              </h3>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {pickHistory
                  .slice()
                  .reverse()
                  .map((pick) => {
                    const player = statsLookup.get(pick.playerId);
                    return (
                      <div
                        key={pick.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          fontSize: 11,
                          borderBottom: '1px solid var(--d-border)',
                          color:
                            pick.teamId === myTeamId
                              ? '#10b981'
                              : 'var(--d-text-secondary)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          #{pick.overallPick} —{' '}
                          {player?.name ?? `Player #${pick.playerId}`}
                        </span>
                        <span
                          style={{ color: 'var(--d-text-muted)', fontSize: 10 }}
                        >
                          {teamNameById(pick.teamId)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actions */}
          <button
            className="d-btn-glass"
            onClick={() => setChatOpen(!chatOpen)}
            aria-pressed={chatOpen}
            aria-label={`League chat ${chatOpen ? 'open' : 'closed'}`}
          >
            <span role="img" aria-label="chat">
              💬
            </span>
            &ensp;League Chat
          </button>
          <button
            className="d-btn-glass"
            onClick={() => {
              void refetchAvailablePlayers();
              if (draftId) void refetchCurrentPick({ draftId });
              void refetchPickHistory();
              void refetchLeague();
            }}
          >
            <span role="img" aria-label="refresh">
              🔄
            </span>
            &ensp;Refresh
          </button>
        </aside>

        {/* ============================================================== */}
        {/* CENTER – PLAYER BOARD                                          */}
        {/* ============================================================== */}
        <div className="d-main" role="main" aria-label="Player draft board">
          {/* Controls */}
          <div className="d-controls">
            {/* Search */}
            <div className="d-search-wrap">
              <svg
                className="d-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="d-search-input"
                type="text"
                placeholder="Search available players..."
                aria-label="Search players"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {availablePlayersLoading && (
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(197, 165, 90, 0.2)',
                    borderTopColor: 'var(--d-accent)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              )}
            </div>

            {/* Position filters */}
            <div
              className="d-pills"
              role="radiogroup"
              aria-label="Filter by position"
              onKeyDown={(e) => {
                const idx = positions.indexOf(selectedPosition);
                let next = idx;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  next = (idx + 1) % positions.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  next = (idx - 1 + positions.length) % positions.length;
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  next = 0;
                } else if (e.key === 'End') {
                  e.preventDefault();
                  next = positions.length - 1;
                }
                if (next !== idx) {
                  setSelectedPosition(positions[next]);
                  // Move focus to the newly selected radio button
                  const container = e.currentTarget;
                  const buttons =
                    container.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    );
                  buttons[next]?.focus();
                }
              }}
            >
              {positions.map((pos) => (
                <button
                  key={pos}
                  className={`d-pill${selectedPosition === pos ? ' active' : ''}`}
                  onClick={() => setSelectedPosition(pos)}
                  role="radio"
                  aria-checked={selectedPosition === pos}
                  tabIndex={selectedPosition === pos ? 0 : -1}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* View mode */}
            <div className="d-views" role="radiogroup" aria-label="View mode">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  className={`d-view-btn${viewMode === mode ? ' active' : ''}`}
                  onClick={() => setViewMode(mode)}
                  role="radio"
                  aria-checked={viewMode === mode}
                  tabIndex={viewMode === mode ? 0 : -1}
                >
                  {mode === 'grid'
                    ? '⊞'
                    : mode === 'list'
                      ? '☰'
                      : mode === 'compact'
                        ? '⋯'
                        : '▦'}
                </button>
              ))}
            </div>
          </div>

          {/* Board View (Team Columns) */}
          {viewMode === 'board' && (
            <DraftGrid
              teams={leagueTeams}
              picks={pickHistory}
              currentPickInfo={currentPickInfo}
              myTeamId={myTeamId}
              statsLookup={statsLookup}
              maxRounds={
                leagueTeams.length > 0
                  ? Math.max(
                      Math.ceil(
                        (pickHistory.length + leagueTeams.length) /
                          leagueTeams.length,
                      ),
                      currentPickInfo?.round ?? 1,
                      ...pickHistory.map((p) => p.round),
                      20,
                    )
                  : 20
              }
            />
          )}

          {/* Player Grid */}
          {viewMode !== 'board' && (
            <div
              className="d-player-grid"
              style={{ gridTemplateColumns: gridCols }}
            >
              {filteredPlayers.map((player, idx) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  index={idx}
                  isMyPick={commPickMode ? isCommissioner : isMyPick}
                  isWatched={watchlist.includes(player.id)}
                  onDraft={() => {
                    if (commPickMode && isCommissioner) {
                      void handleCommissionerPick(player.id);
                    } else {
                      void handleMakePick(player.id);
                    }
                  }}
                  onToggleWatch={() =>
                    setWatchlist((prev) =>
                      prev.includes(player.id)
                        ? prev.filter((id) => id !== player.id)
                        : [...prev, player.id],
                    )
                  }
                />
              ))}

              {filteredPlayers.length === 0 && !availablePlayersLoading && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--d-text-muted)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>
                    <span role="img" aria-label="search">
                      🔍
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    No players found
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {searchTerm
                      ? 'Try a different search term'
                      : 'All available players have been drafted'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paused Overlay */}
      {draftPaused && !isCommissioner && (
        <div className="d-paused-overlay" role="alert" aria-live="assertive">
          <div className="d-paused-card">
            <div className="d-paused-icon">
              <span role="img" aria-label="paused">
                ⏸️
              </span>
            </div>
            <div className="d-paused-title">DRAFT PAUSED</div>
            <div className="d-paused-desc">
              The commissioner has paused the draft. You&apos;ll be notified
              when it resumes.
            </div>
          </div>
        </div>
      )}

      {/* Pick Announcement */}
      {announcement && 'name' in announcement.player && (
        <PickAnnouncement
          player={announcement.player}
          pickNumber={announcement.pickNumber}
          isMyPick={announcement.isMyPick}
          isAuto={announcement.isAuto}
          leaving={announcementLeaving}
          onDismiss={() => {
            if (announcementTimerRef.current)
              clearTimeout(announcementTimerRef.current);
            setAnnouncementLeaving(true);
            setTimeout(() => {
              setAnnouncement(null);
              setAnnouncementLeaving(false);
            }, 400);
          }}
        />
      )}

      {/* Toast notifications */}
      {toastMessage && (
        <div
          className={`d-toast ${toastMessage.type}`}
          role="alert"
          aria-live="assertive"
          onClick={() => setToastMessage(null)}
        >
          {toastMessage.text}
        </div>
      )}

      {urgentMessage && !toastMessage && (
        <div className="d-toast error" role="alert" aria-live="assertive">
          {urgentMessage}
        </div>
      )}

      {/* Chat Overlay */}
      {chatOpen && leagueId !== null && (
        <div
          className="d-chat-overlay"
          role="complementary"
          aria-label="League chat"
        >
          <ChatPanel
            leagueId={String(leagueId)}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
      <div className="sr-only" aria-live="assertive">
        {urgentMessage}
      </div>
    </div>
  );
}
