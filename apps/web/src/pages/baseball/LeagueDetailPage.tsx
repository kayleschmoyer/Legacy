import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import {
  Card,
  H1,
  Input,
  Label,
  Separator,
  Spinner,
  styled,
  Text,
} from 'tamagui';
import {
  ArrowLeftRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Edit3,
  Eye,
  Info,
  LayoutGrid,
  Link2,
  MessageSquare,
  QrCode,
  Settings,
  Share2,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from '@tamagui/lucide-icons';
import { QRCodeSVG } from 'qrcode.react';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import { PageMeta } from '../../components/PageMeta';
import { LeagueActivityFeed } from '../../features/baseball/LeagueActivityFeed';
import { LeagueScoringSummary } from '../../features/baseball/LeagueScoringSummary';
import { LeagueScoringEditor } from '../../features/baseball/LeagueScoringEditor';
import { LeagueTradeBlock } from '../../features/baseball/LeagueTradeBlock';
import { TradingCenter } from '../../features/baseball/TradingCenter';
import { LeagueWebSocketContext } from '../../context/LeagueWebSocketContext';
import { env } from '../../config/environment';
import {
  GetMatchupPlayers,
  LeagueFragment,
  LeaguePositionFragment,
  MatchupPlayerFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsLazyQuery,
  useGetMatchupPlayersQuery,
  useGetPlayoffBracketQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersLazyQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdLazyQuery,
  useJoinPublicLeagueMutation,
  useRenameTeamMutation,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamBrandingMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { LeagueRosterManagement } from '../../features/roster/LeagueRosterManagement';
import { canPlayerPlayPosition } from '../../features/roster/LeagueRosterManagement';
import { PendingWaiverClaims } from '../../features/roster/PendingWaiverClaims';
import { PendingTradeOffers } from '../../features/roster/PendingTradeOffers';
import { LeagueStandings } from '../../features/roster/LeagueStandings';
import { PlayoffBracketDisplay } from '../../components/matchup/PlayoffBracketDisplay';
import { LeagueChatTab } from '../../features/baseball/LeagueChatTab';
import { CommissionerAnnouncementsPanel } from '../../features/baseball/CommissionerAnnouncementsPanel';
import { LeagueFreeAgents } from '../../features/baseball/LeagueFreeAgents';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
  mapSeasonBattingStats,
  mapSeasonFieldingStats,
  mapSeasonPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';
import { NextStepControl } from '../../features/commissioner/NextStepControl';
import { AvatarImage, AvatarPicker } from '../../components/common';
import { DraftSettingsControl } from '../../components/commissioner/DraftSettingsControl';
import { DraftOrderControl } from '../../components/commissioner/DraftOrderControl';
import { LeagueSettingsControl } from '../../components/commissioner/LeagueSettingsControl';
import { LeagueBrandingControl } from '../../components/commissioner/LeagueBrandingControl';
import { AchievementRestrictionsControl } from '../../components/commissioner/AchievementRestrictionsControl';
import { SeasonAwardsControl } from '../../components/commissioner/SeasonAwardsControl';
import { WaiverProcessControl } from '../../features/commissioner/WaiverProcessControl';
import { DeleteLeagueControl } from '../../features/commissioner/DeleteLeagueControl';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupRoster,
  useMatchupsForLeague,
} from '../../hooks/useMatchup';
import { MatchupScoreboard } from '../../features/matchup/MatchupScoreboard';
import { GamesRemaining } from '../../features/matchup/GamesRemaining';
import { MatchupRosterComparison } from '../../features/matchup/MatchupRosterComparison';
import { MatchupNavigationControls } from '../../features/matchup/MatchupNavigationControls';
import { announcePolite } from '../../utils/a11y';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setIsCommissioner,
  setLeagueData,
  setLeagueId,
  setLeaguePositions,
  setLeagueTeams,
  setTeamMembers,
  setTeamsLoading,
  setUserTeamId,
  updateTeamMember,
} from '../../store/leagueSlice';

// ── Matchup Scoring Data (shared with roster component) ─────────────────────

export interface PlayerMatchupData {
  /** Actual score from games already played */
  score: number;
  /** Projected total score (actual + projected remaining) */
  projection: number;
  /** Number of games that have been selected/played */
  gamesPlayed: number;
  /** Total games in this matchup */
  totalGames: number;
  /** Whether this player has any game selections (and should be roster-locked) */
  isLocked: boolean;
}

// ── GraphQL (all queries/mutations defined in src/api/db/**/*.graphql) ────────

// ── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$8',
});

const HeroBar = styled(XStack, {
  position: 'relative',
  overflow: 'hidden',
  paddingHorizontal: '$6',
  paddingVertical: '$6',
  gap: '$5',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  $sm: {
    paddingHorizontal: '$4',
    paddingVertical: '$4',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
});

const ContentArea = styled(YStack, {
  maxWidth: 1200,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$6',
  $sm: { paddingHorizontal: '$3' },
});

const TabBar = styled(XStack, {
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  gap: 0,
  overflow: 'auto',
  maxWidth: 1200,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$6',
  $sm: { paddingHorizontal: '$3' },
});

const DraftBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
});

const SnapshotBar = styled(XStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  paddingVertical: '$4',
  paddingHorizontal: '$5',
  gap: '$4',
  alignItems: 'center',
  justifyContent: 'space-around',
  flexWrap: 'wrap',
  backdropFilter: 'blur(12px)',
  $sm: {
    paddingHorizontal: '$3',
    paddingVertical: '$3',
    gap: '$3',
  },
});

const SnapshotStat = styled(YStack, {
  alignItems: 'center',
  gap: '$1',
  minWidth: 80,
});

const SnapshotDivider = styled(YStack, {
  width: 1,
  height: 36,
  backgroundColor: '$outlineSubtle',
  $sm: {
    display: 'none' as never,
  },
});

const SidebarCard = styled(Card, {
  backgroundColor: '$surfacePanel',
  borderColor: '$surfacePanelBorder',
  borderWidth: 1,
  borderRadius: '$6',
  padding: '$5',
  animation: 'quick',
  hoverStyle: {
    borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
  },
});

const DraftBanner = styled(Card, {
  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
  borderWidth: 2,
  borderRadius: '$6',
  padding: '$5',
  overflow: 'hidden',
});

const InviteCard = styled(Card, {
  backgroundColor: '$surfacePanel',
  borderColor: '$surfacePanelBorder',
  borderWidth: 1,
  borderRadius: '$6',
  padding: '$5',
});

const CommissionerSectionHeader = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '$surfacePanel',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$glassBorder',
  cursor: 'pointer' as never,
  animation: 'quick',
  hoverStyle: {
    backgroundColor: '$color2',
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDraftStatus(status?: string | null): string {
  if (!status) return 'Unknown';
  switch (status) {
    case 'not-started':
      return 'Pre-Draft';
    case 'queued':
      return 'Queued';
    case 'in-progress':
      return 'Drafting';
    case 'completed':
      return 'Season Active';
    default:
      return status.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

function getDraftBadgeColors(status?: string | null) {
  switch (status) {
    case 'not-started':
      return { bg: '$gray3', border: '$gray7', text: '$gray11' };
    case 'queued':
      return { bg: '$amber3', border: '$amber7', text: '$amber11' };
    case 'in-progress':
      return {
        bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
        border: withAlpha(BRAND_NAVY_LIGHT, 0.5),
        text: BRAND_GOLD_LIGHT,
      };
    case 'completed':
      return { bg: '$green3', border: '$green7', text: '$green11' };
    case undefined:
    case null:
    default:
      return { bg: '$gray3', border: '$gray7', text: '$gray11' };
  }
}

// ── Tab Definitions ──────────────────────────────────────────────────────────

type TabId =
  | 'overview'
  | 'roster'
  | 'free-agents'
  | 'standings'
  | 'matchup'
  | 'trades'
  | 'team-settings'
  | 'commissioner';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  commissionerOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
  { id: 'roster', label: 'My Roster', icon: <ClipboardList size={16} /> },
  { id: 'free-agents', label: 'Free Agents', icon: <UserPlus size={16} /> },
  { id: 'standings', label: 'Standings', icon: <Trophy size={16} /> },
  { id: 'matchup', label: 'Matchup', icon: <Swords size={16} /> },
  { id: 'trades', label: 'Trades', icon: <ArrowLeftRight size={16} /> },
  { id: 'team-settings', label: 'My Team', icon: <Edit3 size={16} /> },
  {
    id: 'commissioner',
    label: 'Commissioner',
    icon: <Settings size={16} />,
    commissionerOnly: true,
  },
];

// Backward-compatible URL mapping (old "info" tab → new "overview")
const TAB_ALIASES: Record<string, TabId> = {
  info: 'overview',
  overview: 'overview',
  roster: 'roster',
  'free-agents': 'free-agents',
  standings: 'standings',
  matchup: 'matchup',
  trades: 'trades',
  'team-settings': 'team-settings',
  commissioner: 'commissioner',
};

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueDetailPage(): React.JSX.Element {
  const {
    id,
    tab: tabParam,
    matchupId: matchupIdParam,
  } = useParams<{
    id: string;
    tab?: string;
    matchupId?: string;
  }>();
  const leagueId = parseInt(id || '0', 10);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const {
    leagueData: reduxLeagueData,
    positions: reduxPositions,
    teamMembers: reduxTeamMembers,
    leagueTeams: reduxLeagueTeams,
    userTeamId: reduxUserTeamId,
    isCommissioner: reduxIsCommissioner,
  } = useAppSelector((state) => state.league);

  const getTabFromUrl = useCallback((): TabId => {
    if (tabParam && tabParam in TAB_ALIASES) {
      return TAB_ALIASES[tabParam];
    }
    return 'overview';
  }, [tabParam]);

  const [activeTab, setActiveTab] = useState<TabId>(getTabFromUrl());
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [headerInviteCopied, setHeaderInviteCopied] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [renameEditing, setRenameEditing] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameSuccess, setRenameSuccess] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // ── Viewing Other Team State ──
  /** When set, the roster tab shows another team's roster in read-only mode */
  const [viewingTeamId, setViewingTeamId] = useState<number | null>(null);

  // ── Roster Tab Week Selector ──
  /** When set, the roster tab shows the lineup context for a specific week.
   *  null = current week (default, editable). Past weeks are read-only. */
  const [rosterViewWeek, setRosterViewWeek] = useState<number | null>(null);

  // ── Overview Sub-Tab ──
  /** Controls which section is shown in the compact tabbed card on the overview. */
  const [overviewSubTab, setOverviewSubTab] = useState<
    'activity' | 'chat' | 'scoring'
  >('activity');

  const { user } = useAuth();

  // Ref to hold refetchCurrentWeek so WebSocket callbacks can call it
  // without creating a hook-ordering dependency
  const refetchCurrentWeekRef = useRef<
    (() => void | Promise<unknown>) | undefined
  >(undefined);

  // Ref to hold refetchTeamMembers so handleDraftCompleted can call it
  // without creating a hook-ordering dependency (query is declared later)
  const refetchTeamMembersRef = useRef<
    (() => void | Promise<unknown>) | undefined
  >(undefined);

  // Ref to hold refetchMatchups so WebSocket callbacks can trigger a matchup
  // list refresh (game selection start/complete) without creating a hook-ordering
  // dependency (query is declared later).
  const refetchMatchupsRef = useRef<
    (() => void | Promise<unknown>) | undefined
  >(undefined);

  // Ref that always holds the latest draftStatus so the WS reconnect effect
  // can read it without adding it to the dependency array.
  const leagueDraftStatusRef = useRef<string | null | undefined>(undefined);

  // Tracks the previous draftStatus so we can detect the actual transition to
  // 'completed' rather than firing on every mount for post-draft leagues.
  const prevDraftStatusRef = useRef<string | null | undefined>(undefined);

  // ── Effects ──

  useEffect(() => {
    if (!isNaN(leagueId)) {
      dispatch(setLeagueId(leagueId));
    }
  }, [leagueId, dispatch]);

  useEffect(() => {
    const tabFromUrl = getTabFromUrl();
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [getTabFromUrl, activeTab]);

  const changeTab = useCallback(
    (newTab: TabId) => {
      // Clear "viewing other team" state when navigating away from roster
      if (newTab !== 'roster') {
        setViewingTeamId(null);
      }
      setActiveTab(newTab);
      navigate(`/baseball/league/${leagueId}/${newTab}`, { replace: false });
    },
    [navigate, leagueId],
  );

  // ── Data Fetching ──

  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data,
    loading,
    error,
    refetch: refetchLeague,
  } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId },
  });

  useEffect(() => {
    if (data?.league) {
      dispatch(setLeagueData(data.league));
      dispatch(setIsCommissioner(data.league.owner === user?.id));
    }
  }, [data, dispatch, user?.id]);

  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      skip: isNaN(leagueId) || reduxPositions.length > 0,
      variables: { leagueId },
    });

  useEffect(() => {
    if (positionsData?.leaguePositions) {
      dispatch(
        setLeaguePositions(
          positionsData.leaguePositions as LeaguePositionFragment[],
        ),
      );
    }
  }, [positionsData, dispatch]);

  const [getUserTeamId, { data: userTeamData, loading: userTeamLoading }] =
    useGetUserTeamIdLazyQuery({ fetchPolicy: 'network-only' });

  const [
    getLeagueTeams,
    { data: leagueTeamsData, loading: leagueTeamsLoading },
  ] = useGetLeagueTeamsLazyQuery();

  useEffect(() => {
    if (userTeamData?.userTeamId !== undefined) {
      dispatch(setUserTeamId(userTeamData.userTeamId ?? null));
    }
  }, [userTeamData, dispatch]);

  useEffect(() => {
    if (leagueTeamsData?.leagueTeams) {
      dispatch(
        setLeagueTeams(
          leagueTeamsData.leagueTeams.map((t) => ({
            id: t.id ?? 0,
            name: t.name ?? '',
            leagueId: t.leagueId ?? 0,
            waiverOrder: t.waiverOrder ?? null,
            faabBudget: t.faabBudget ?? null,
            logoUrl: t.logoUrl ?? null,
            primaryColor: t.primaryColor ?? null,
            secondaryColor: t.secondaryColor ?? null,
          })),
        ),
      );
    }
  }, [leagueTeamsData, dispatch]);

  useEffect(() => {
    if (!isNaN(leagueId) && user?.id && reduxUserTeamId === null) {
      void getUserTeamId({ variables: { leagueId } });
    }
  }, [leagueId, user?.id, reduxUserTeamId, getUserTeamId]);

  // Eagerly fetch league teams (needed for overview sidebar + standings)
  useEffect(() => {
    if (!isNaN(leagueId) && reduxLeagueTeams.length === 0) {
      dispatch(setTeamsLoading(true));
      void getLeagueTeams({ variables: { leagueId } });
    }
  }, [leagueId, reduxLeagueTeams.length, getLeagueTeams, dispatch]);

  // Fetch playoff bracket for the standings tab
  const { data: bracketData, loading: bracketLoading } =
    useGetPlayoffBracketQuery({
      variables: { leagueId },
      skip: isNaN(leagueId) || activeTab !== 'standings',
    });

  // ── WebSocket: listen for draft lifecycle events ──

  const isAuthenticated = !!user;

  // Wrap refetchLeague so we can track background-refresh state for the UI
  // indicator without replacing the entire page with a spinner.
  const backgroundRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchLeague();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchLeague]);

  const handleDraftCompleted = useCallback(() => {
    void backgroundRefetch();
    // Refetch team members in the background — do NOT clear redux teamMembers
    // to [] because that causes the page to flash a full-page spinner.
    void refetchTeamMembersRef.current?.();
    // Refetch the current week so it reflects the newly drafted rosters.
    void refetchCurrentWeekRef.current?.();
  }, [backgroundRefetch]);

  const handleDraftStarted = useCallback(() => {
    void backgroundRefetch();
  }, [backgroundRefetch]);

  const handleRosterUpdate = useCallback(() => {
    void backgroundRefetch();
  }, [backgroundRefetch]);

  const handleMatchupStatsComplete = useCallback(() => {
    void backgroundRefetch();
    // Also refetch matchup data so statsLoadingStatus updates and spinner clears
    void refetchCurrentWeekRef.current?.();
    void refetchMatchupsRef.current?.();
  }, [backgroundRefetch]);

  const handlePlayerStatsLoading = useCallback(() => {
    // Game selection has started — immediately reload matchup data so the
    // matchup tab reflects the freshly-assigned games and updated scores.
    void refetchMatchupsRef.current?.();
    void refetchCurrentWeekRef.current?.();
  }, []);

  // Create the single shared WebSocket connection for this league page.
  // All child components (chat, trades, roster) subscribe via
  // LeagueWebSocketContext instead of opening their own connections.
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    const wsUrl = env.websocketUrl;
    LOGGER.info('[LeagueDetailPage] WebSocket config', {
      websocketUrl: wsUrl ? `${wsUrl.substring(0, 30)}...` : 'NOT SET',
      isAuthenticated,
      leagueId,
    });
    if (!wsUrl || !isAuthenticated || isNaN(leagueId)) return;

    let active = true;
    const client = new WebSocketClient({
      url: wsUrl,
      // No token — auth is carried by the HttpOnly cookie sent with the WS handshake.
      // NOTE: If the WS endpoint is on a different domain than the API (e.g.
      // ws.legacy-fantasy.com vs api.legacy-fantasy.com), the cookie won't be
      // sent. In that case, set a `Domain=.legacy-fantasy.com` attribute on
      // the cookie or pass the token via query string.
      leagueId,
      viewContext: 'league',
      autoConnect: false,
    });
    setWsClient(client);
    client.on('connected', () => {
      if (active) {
        setWsConnected(true);
        setWsError(null);
      }
    });
    client.on('disconnected', () => {
      if (active) setWsConnected(false);
    });
    client.on('error', (err: Error) => {
      if (active) setWsError(err.message);
    });
    void Promise.resolve().then(() => {
      if (active) client.connect();
    });
    return () => {
      active = false;
      client.dispose();
      setWsClient(null);
      setWsConnected(false);
    };
  }, [leagueId, isAuthenticated]);

  // Subscribe to league-level events on the shared socket.
  useEffect(() => {
    if (!wsClient) return;
    const unsubs: Array<() => void> = [
      wsClient.on(ClientNotificationType.DRAFT_COMPLETED, () =>
        handleDraftCompleted(),
      ),
      wsClient.on(ClientNotificationType.DRAFT_STARTED, () =>
        handleDraftStarted(),
      ),
      wsClient.on(ClientNotificationType.ROSTER_UPDATE, () =>
        handleRosterUpdate(),
      ),
      wsClient.on(ClientNotificationType.MATCHUP_STATS_COMPLETE, () =>
        handleMatchupStatsComplete(),
      ),
      wsClient.on(ClientNotificationType.PLAYER_STATS_LOADING, () =>
        handlePlayerStatsLoading(),
      ),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [
    wsClient,
    handleDraftCompleted,
    handleDraftStarted,
    handleRosterUpdate,
    handleMatchupStatsComplete,
    handlePlayerStatsLoading,
  ]);

  useEffect(() => {
    if (wsError) {
      LOGGER.debug('[LeagueDetailPage] WebSocket error:', wsError);
    }
  }, [wsError]);

  useEffect(() => {
    LOGGER.info('[LeagueDetailPage] WebSocket connected:', wsConnected);
  }, [wsConnected]);

  // One-time catch-up refetch: when the WebSocket (re)connects while a draft
  // is still in-progress or queued, fetch the league once in case the
  // DRAFT_COMPLETED notification was broadcast while the client was offline.
  useEffect(() => {
    if (!wsConnected) return;
    const status = leagueDraftStatusRef.current;
    if (status === 'in-progress' || status === 'queued') {
      void backgroundRefetch();
    }
  }, [wsConnected, backgroundRefetch]);

  // ── Derived Data ──

  const userTeamId = reduxUserTeamId ?? userTeamData?.userTeamId ?? null;
  const league = reduxLeagueData ?? data?.league;
  // Keep the ref in sync with the latest derived draftStatus on every render.
  leagueDraftStatusRef.current = league?.draftStatus;

  // Stable snapshot used by the effects below so they have a proper dep value.
  const draftStatus = league?.draftStatus ?? null;

  // While a draft is pending / running, shorten the WebSocket heartbeat to 15 s
  // so that a zombie connection (server-side row deleted but TCP still alive) is
  // detected and recycled quickly — much cheaper than polling the GraphQL API.
  const DRAFT_HEARTBEAT_MS = 15_000;
  useEffect(() => {
    if (!wsClient) return;
    if (draftStatus === 'in-progress' || draftStatus === 'queued') {
      wsClient.setHeartbeatInterval(DRAFT_HEARTBEAT_MS);
    } else {
      // Reset to the default 8-minute cadence
      wsClient.setHeartbeatInterval();
    }
  }, [wsClient, draftStatus]);

  // When the draft transitions to 'completed' (via WS event or reconnect
  // catch-up), also refetch team members so newly drafted players appear on the
  // roster tab.
  //
  // Guard conditions:
  // - Only fire on the actual transition (prevStatus was not already 'completed')
  //   to avoid a spurious refetch on every mount for post-draft leagues.
  // - Only fire when userTeamId is known so we never call the Lambda with
  //   teamId=0, which throws "Failed to fetch team members" (LS-531 / LS-536).
  useEffect(() => {
    const prevStatus = prevDraftStatusRef.current;
    prevDraftStatusRef.current = draftStatus;

    if (
      draftStatus === 'completed' &&
      prevStatus !== undefined &&
      prevStatus !== 'completed' &&
      userTeamId
    ) {
      void refetchTeamMembersRef.current?.();
    }
  }, [draftStatus, userTeamId]);

  const positions = useMemo(
    () =>
      reduxPositions.length > 0
        ? reduxPositions
        : (positionsData?.leaguePositions as LeaguePositionFragment[]) || [],
    [reduxPositions, positionsData?.leaguePositions],
  );
  const leagueTeams =
    reduxLeagueTeams.length > 0
      ? reduxLeagueTeams
      : (leagueTeamsData?.leagueTeams ?? []).map((t) => ({
          id: t.id ?? 0,
          name: t.name ?? '',
          leagueId: t.leagueId ?? 0,
          waiverOrder: t.waiverOrder ?? null,
          faabBudget: t.faabBudget ?? null,
          logoUrl: t.logoUrl ?? null,
          primaryColor: t.primaryColor ?? null,
          secondaryColor: t.secondaryColor ?? null,
        }));

  const isCommissioner = reduxIsCommissioner || league?.owner === user?.id;

  // Spectator mode: authenticated user viewing a public league they are not a member of.
  // Check both data.league.userMembership (Apollo cache) AND userTeamId (from the separate
  // GetUserTeamId query), because the Apollo cache may be stale (e.g. user just joined via the
  // discovery page). Without the userTeamId guard the join button incorrectly appears for
  // existing members whose cached league data still shows userMembership: null (LS-1033).
  const isSpectator = !!(
    data?.league?.isPublic &&
    !data?.league?.userMembership &&
    !userTeamId
  );

  // LS-1057: Once league data has loaded and commissioner status is known,
  // redirect any non-commissioner who navigated directly to the commissioner
  // tab back to the overview tab so they don't see a blank panel.
  useEffect(() => {
    if (league && activeTab === 'commissioner' && !isCommissioner) {
      changeTab('overview');
    }
  }, [league, activeTab, isCommissioner, changeTab]);

  // ── Spectator join flow ──────────────────────────────────────────────────
  const [spectatorTeamName, setSpectatorTeamName] = useState('');
  const [spectatorJoinError, setSpectatorJoinError] = useState<string | null>(
    null,
  );
  const [spectatorJoinSuccess, setSpectatorJoinSuccess] = useState(false);
  const [showSpectatorJoin, setShowSpectatorJoin] = useState(false);

  const [joinPublicLeague, { loading: joiningLeague }] =
    useJoinPublicLeagueMutation();

  const handleSpectatorJoin = useCallback(async () => {
    if (!spectatorTeamName.trim()) {
      setSpectatorJoinError('Please enter a team name');
      return;
    }
    setSpectatorJoinError(null);
    try {
      await joinPublicLeague({
        variables: { leagueId, teamName: spectatorTeamName.trim() },
      });
      setSpectatorJoinSuccess(true);
      void refetchLeague();
      setTimeout(() => navigate(`/baseball/league/${leagueId}/overview`), 1200);
    } catch (err) {
      setSpectatorJoinError((err as Error).message || 'Failed to join league');
    }
  }, [spectatorTeamName, joinPublicLeague, leagueId, refetchLeague, navigate]);

  const {
    data: teamMembersData,
    loading: teamMembersLoading,
    refetch: refetchTeamMembers,
  } = useGetTeamMembersQuery({
    skip: !userTeamId || reduxTeamMembers.length > 0,
    variables: { teamId: userTeamId || 0 },
  });
  // Keep a stable ref so handleDraftCompleted (defined earlier) can call refetch
  refetchTeamMembersRef.current = refetchTeamMembers;

  useEffect(() => {
    if (teamMembersData?.teamMembers) {
      dispatch(
        setTeamMembers(
          teamMembersData.teamMembers.filter(
            (m: TeamMemberFragment | null) => m !== null,
          ),
        ),
      );
    }
  }, [teamMembersData, dispatch]);

  const teamMembers = useMemo(
    () =>
      reduxTeamMembers.length > 0
        ? reduxTeamMembers
        : (teamMembersData?.teamMembers?.filter(
            (m: TeamMemberFragment | null) => m !== null,
          ) as TeamMemberFragment[]) || [],
    [reduxTeamMembers, teamMembersData?.teamMembers],
  );

  // ── Other Team Viewing (lazy fetch when clicking a team in standings) ──

  const [
    fetchViewingTeamMembers,
    { data: viewingTeamMembersData, loading: viewingTeamMembersLoading },
  ] = useGetTeamMembersLazyQuery();

  useEffect(() => {
    if (viewingTeamId) {
      void fetchViewingTeamMembers({ variables: { teamId: viewingTeamId } });
    }
  }, [viewingTeamId, fetchViewingTeamMembers]);

  const viewingTeamMembers = useMemo(
    () =>
      viewingTeamId
        ? ((viewingTeamMembersData?.teamMembers?.filter(
            (m: TeamMemberFragment | null) => m !== null,
          ) as TeamMemberFragment[]) ?? [])
        : [],
    [viewingTeamId, viewingTeamMembersData?.teamMembers],
  );

  const viewingTeamName = useMemo(() => {
    if (!viewingTeamId) return undefined;
    const team = leagueTeams.find((t) => t.id === viewingTeamId);
    return team?.name ?? 'Team';
  }, [viewingTeamId, leagueTeams]);

  const isViewingOwnTeam = viewingTeamId === userTeamId;

  const handleViewTeamRoster = useCallback(
    (teamId: number) => {
      if (teamId === userTeamId) {
        // Clicking own team just goes to the roster tab normally
        setViewingTeamId(null);
      } else {
        setViewingTeamId(teamId);
      }
      changeTab('roster');
    },
    [userTeamId, changeTab],
  );

  const handleBackToMyRoster = useCallback(() => {
    setViewingTeamId(null);
  }, []);

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  const [renameTeamMutation, { loading: renaming }] = useRenameTeamMutation();
  const [updateTeamBranding, { loading: teamBrandingLoading }] =
    useUpdateTeamBrandingMutation();
  const [teamPrimaryColor, setTeamPrimaryColor] = useState('');
  const [teamSecondaryColor, setTeamSecondaryColor] = useState('');
  const [teamColorSuccess, setTeamColorSuccess] = useState(false);
  const [teamColorError, setTeamColorError] = useState<string | null>(null);

  // Pre-populate color inputs with the team's existing saved colors so that
  // opening Team Settings and saving without editing does not clear them.
  useEffect(() => {
    const userTeam = reduxLeagueTeams.find((t) => t.id === reduxUserTeamId);
    if (userTeam) {
      setTeamPrimaryColor(userTeam.primaryColor ?? '');
      setTeamSecondaryColor(userTeam.secondaryColor ?? '');
    }
  }, [reduxLeagueTeams, reduxUserTeamId]);

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
    profileName: scoringProfileName,
    profile: scoringProfile,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  // Current week (for default selection)
  const {
    currentWeek,
    loading: currentWeekLoading,
    error: currentWeekError,
    refetch: refetchCurrentWeek,
  } = useCurrentWeek(!isNaN(leagueId) ? leagueId : null);

  // Keep the ref in sync so WebSocket callbacks can trigger refetch
  refetchCurrentWeekRef.current = refetchCurrentWeek;

  // Selected matchup state (null means show current matchup)
  // Initialize from URL route parameter if present
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(
    matchupIdParam ?? null,
  );

  // Fetch all matchups for navigation
  const { matchups: allLeagueMatchups, refetch: refetchMatchups } =
    useMatchupsForLeague(!isNaN(leagueId) ? leagueId : null);
  // Keep the ref in sync so WebSocket callbacks can trigger matchup refetch
  refetchMatchupsRef.current = refetchMatchups;

  // The user's own matchup for the current active week (may differ from the
  // league-level current week pointer, since a league has one matchup *per
  // team pair* each week).
  const userCurrentMatchup = useMemo(() => {
    if (!reduxUserTeamId || !allLeagueMatchups.length || !currentWeek)
      return null;
    return (
      allLeagueMatchups.find(
        (m) =>
          m.weekNumber === currentWeek &&
          (m.team1Id === reduxUserTeamId || m.team2Id === reduxUserTeamId),
      ) ?? null
    );
  }, [reduxUserTeamId, allLeagueMatchups, currentWeek]);

  // Fetch selected matchup if user navigated away from current
  const {
    matchup: selectedMatchup,
    loading: selectedMatchupLoading,
    error: selectedMatchupError,
  } = useMatchupById(
    selectedMatchupId ? parseInt(selectedMatchupId, 10) : null,
  );

  // Determine which matchup to display
  const displayedMatchup = selectedMatchupId
    ? selectedMatchup
    : (userCurrentMatchup ??
      allLeagueMatchups.find((m) => m.weekNumber === currentWeek) ??
      null);
  const matchupLoading = selectedMatchupId
    ? selectedMatchupLoading
    : currentWeekLoading;
  const matchupError = selectedMatchupId
    ? selectedMatchupError
    : currentWeekError;
  const refetchMatchup = useMemo(
    () =>
      selectedMatchupId
        ? () => {
            void refetchCurrentWeek();
          }
        : refetchCurrentWeek,
    [selectedMatchupId, refetchCurrentWeek],
  );

  // Sync selected matchup ID when URL param changes (e.g., when navigating via shared link)
  useEffect(() => {
    if (matchupIdParam !== selectedMatchupId) {
      setSelectedMatchupId(matchupIdParam ?? null);
    }
  }, [matchupIdParam, selectedMatchupId]);

  // Reset to current matchup when it changes (e.g., week advance)
  useEffect(() => {
    if (userCurrentMatchup?.id && !selectedMatchupId) {
      // We're viewing current matchup and it changed, stay on current
    } else if (
      userCurrentMatchup?.id &&
      selectedMatchupId === String(userCurrentMatchup.id)
    ) {
      // We were viewing current, and it's still current, stay selected
    }
  }, [userCurrentMatchup?.id, selectedMatchupId]);

  // ── Roster Tab Week Context ─────────────────────────────────────────────

  // Weeks that the user's team has a matchup in (sorted ascending)
  const availableRosterWeeks = useMemo(() => {
    if (!reduxUserTeamId || !allLeagueMatchups.length) return [];
    const weeks = allLeagueMatchups
      .filter(
        (m) => m.team1Id === reduxUserTeamId || m.team2Id === reduxUserTeamId,
      )
      .map((m) => m.weekNumber)
      .filter((w): w is number => w != null);
    return [...new Set(weeks)].sort((a, b) => a - b);
  }, [reduxUserTeamId, allLeagueMatchups]);

  // The effective week being shown in the roster tab
  const rosterSelectedWeek = rosterViewWeek ?? currentWeek ?? null;

  // The user's matchup for the selected roster week
  const rosterWeekMatchup = useMemo(() => {
    if (!rosterSelectedWeek || !reduxUserTeamId) return null;
    return (
      allLeagueMatchups.find(
        (m) =>
          m.weekNumber === rosterSelectedWeek &&
          (m.team1Id === reduxUserTeamId || m.team2Id === reduxUserTeamId),
      ) ?? null
    );
  }, [rosterSelectedWeek, reduxUserTeamId, allLeagueMatchups]);

  // True when viewing a completed past week — show frozen historical lineup
  const isViewingHistoricalRosterWeek =
    rosterSelectedWeek !== null &&
    currentWeek !== null &&
    rosterSelectedWeek < currentWeek;

  const rosterMatchupIdNum = isViewingHistoricalRosterWeek
    ? rosterWeekMatchup?.id
      ? parseInt(rosterWeekMatchup.id, 10)
      : null
    : null;

  const { roster: historicalRoster, loading: historicalRosterLoading } =
    useMatchupRoster(
      rosterMatchupIdNum,
      isViewingHistoricalRosterWeek ? (userTeamId ?? null) : null,
    );

  // Map MatchupPlayerFragment → TeamMemberFragment shape for LeagueRosterManagement
  const historicalTeamMembers = useMemo((): TeamMemberFragment[] => {
    if (!isViewingHistoricalRosterWeek || !historicalRoster.length) return [];
    return historicalRoster
      .filter((mp): mp is NonNullable<MatchupPlayerFragment> => mp !== null)
      .map(
        (mp): TeamMemberFragment => ({
          id: mp.id != null ? parseInt(mp.id, 10) : null,
          playerId: mp.playerId ?? 0,
          positionId: mp.positionId ?? null,
          teamId: mp.teamId ?? 0,
          leagueId,
          onTradeBlock: false,
          player: mp.player
            ? {
                id: mp.player.id,
                firstName: mp.player.firstName,
                lastName: mp.player.lastName,
                brefId: mp.player.brefId,
                eligiblePositions: mp.player.eligiblePositions ?? [],
                careerBatting: null,
                seasonsPlayed: null,
              }
            : null,
        }),
      );
  }, [isViewingHistoricalRosterWeek, historicalRoster, leagueId]);

  // Opponent team info for the roster week selector banner
  const rosterOpponentTeamId = useMemo(() => {
    if (!rosterWeekMatchup || !reduxUserTeamId) return null;
    return rosterWeekMatchup.team1Id === reduxUserTeamId
      ? rosterWeekMatchup.team2Id
      : rosterWeekMatchup.team1Id;
  }, [rosterWeekMatchup, reduxUserTeamId]);

  const rosterOpponentTeam = useMemo(
    () => leagueTeams.find((t) => t.id === rosterOpponentTeamId) ?? null,
    [leagueTeams, rosterOpponentTeamId],
  );

  // ── Matchup Player Data (for scores, projections, and roster locking) ────

  const displayedMatchupIdNum = displayedMatchup?.id
    ? parseInt(displayedMatchup.id, 10)
    : null;

  const { data: matchupPlayersData } = useGetMatchupPlayersQuery({
    variables: { matchupId: displayedMatchupIdNum ?? 0 },
    skip: !displayedMatchupIdNum,
    fetchPolicy: 'cache-and-network',
  });

  const gamesPerMatchup = displayedMatchup?.gamesPerMatchup ?? 10;

  /** Map of playerId → scoring + lock data for the currently displayed matchup */
  const playerMatchupDataMap = useMemo((): ReadonlyMap<
    number,
    PlayerMatchupData
  > => {
    const map = new Map<number, PlayerMatchupData>();
    const players = matchupPlayersData?.getMatchupPlayers;
    if (!players || !scoringSettings) return map;

    for (const mp of players) {
      const pid = mp.playerId;
      if (pid == null) continue;

      // Calculate actual score from played games
      const gamesPlayed = mp.games?.length ?? 0;
      let actualScore = 0;
      for (const game of mp.games ?? []) {
        if (game.battingGame) {
          actualScore += computeScoring(
            mapBattingStats(game.battingGame),
            scoringSettings.batting ?? {},
          );
        }
        if (game.pitchingGame) {
          actualScore += computeScoring(
            mapPitchingStats(game.pitchingGame),
            scoringSettings.pitching ?? {},
          );
        }
        if (game.fieldingGame) {
          actualScore += computeScoring(
            mapFieldingStats(game.fieldingGame),
            scoringSettings.fielding ?? {},
          );
        }
      }

      // Calculate projection
      // Use player-specific numberOfGames (SP gets spStartsPerMatchup, others get gamesPerMatchup)
      const playerTotalGames = mp.numberOfGames ?? gamesPerMatchup;
      const gamesRemaining = playerTotalGames - gamesPlayed;
      let projection = actualScore;
      if (gamesRemaining > 0) {
        // Try season stats projection first.
        // mapSeason*Stats converts the GraphQL camelCase field names (e.g. "homeRuns",
        // "games") to the short DB column names (e.g. "hr", "g") that
        // calculateMatchupProjection / computeAverageScoring expect.
        const mappedBatting = mapSeasonBattingStats(mp.seasonBatting);
        const mappedPitching = mapSeasonPitchingStats(mp.seasonPitching);
        const mappedFielding = mapSeasonFieldingStats(mp.seasonFielding);
        const seasonStats: SeasonStats = {
          playerId: pid,
          season: mp.season ?? new Date().getFullYear(),
          battingStats: mappedBatting ?? undefined,
          pitchingStats: mappedPitching ?? undefined,
          fieldingStats: mappedFielding ?? undefined,
        };
        if (
          seasonStats.battingStats ||
          seasonStats.pitchingStats ||
          seasonStats.fieldingStats
        ) {
          try {
            const proj = calculateMatchupProjection(
              seasonStats,
              scoringSettings,
            );
            projection = actualScore + proj.totalPerGame * gamesRemaining;
          } catch {
            // Fallback: avg of games played
            if (gamesPlayed > 0) {
              projection =
                actualScore + (actualScore / gamesPlayed) * gamesRemaining;
            }
          }
        } else if (gamesPlayed > 0) {
          projection =
            actualScore + (actualScore / gamesPlayed) * gamesRemaining;
        }
      }

      map.set(pid, {
        score: Math.round(actualScore * 10) / 10,
        projection: Math.round(projection * 10) / 10,
        gamesPlayed,
        totalGames: playerTotalGames,
        isLocked: gamesPlayed > 0,
      });
    }

    return map;
  }, [matchupPlayersData, scoringSettings, gamesPerMatchup]);

  const [matchupSuccessMessage, setMatchupSuccessMessage] = useState<
    string | null
  >(null);
  const [matchupErrorMessage, setMatchupErrorMessage] = useState<string | null>(
    null,
  );
  // LS-1073: single ref for the auto-clear timeout — prevents an older timeout
  // from clearing a newer success message when two saves happen within 5 seconds.
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LS-507: track whether DraftSettingsControl has unsaved changes
  const [hasDraftSettingsChanges, setHasDraftSettingsChanges] = useState(false);

  // Commissioner accordion — "Next Step" open by default
  const [commissionerOpenSections, setCommissionerOpenSections] = useState<
    Set<string>
  >(() => new Set(['next-step']));

  const toggleCommissionerSection = useCallback((id: string) => {
    setCommissionerOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ── Callbacks ──

  const handleMatchupSuccess = useCallback(
    (actionType?: 'selectGame' | 'advance' | 'draft' | 'createWeek1') => {
      let message: string;
      if (actionType === 'draft') {
        message =
          'Draft started successfully! You can now create Week 1 matchups.';
      } else if (actionType === 'createWeek1') {
        message = 'Week 1 matchups created successfully!';
      } else if (actionType === 'advance') {
        message = 'Week advanced successfully! New matchups created.';
      } else {
        message = 'Game selection triggered! Processing in background...';
      }
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      setMatchupSuccessMessage(message);
      setMatchupErrorMessage(null);
      announcePolite(message);
      void refetchMatchup();
      successTimeoutRef.current = setTimeout(
        () => setMatchupSuccessMessage(null),
        5000,
      );
    },
    [refetchMatchup],
  );

  // LS-1073: centralised helper so all commissioner onSuccess callbacks share
  // the same timeout ref — cancels any pending auto-clear before starting fresh.
  const showMatchupSuccess = useCallback((message: string) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setMatchupSuccessMessage(message);
    setMatchupErrorMessage(null);
    successTimeoutRef.current = setTimeout(
      () => setMatchupSuccessMessage(null),
      5000,
    );
  }, []);

  const handleMatchupError = useCallback((err: Error) => {
    setMatchupErrorMessage(err.message);
    setMatchupSuccessMessage(null);
    announcePolite(`Error: ${err.message}`);
  }, []);

  const handleLeagueUpdate = useCallback(
    (updatedLeague: LeagueFragment) => {
      dispatch(setLeagueData(updatedLeague));
    },
    [dispatch],
  );

  const handlePlayerAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (!player.id) {
        LOGGER.error('Player ID is required');
        return;
      }
      try {
        const result = await updateTeamMemberPosition({
          variables: { teamMemberId: player.id, positionId: position.id },
          ...(displayedMatchupIdNum && {
            refetchQueries: [
              {
                query: GetMatchupPlayers,
                variables: { matchupId: displayedMatchupIdNum },
              },
            ],
          }),
        });
        const updated = result.data?.updateTeamMemberPosition;
        if (updated) {
          dispatch(updateTeamMember(updated as TeamMemberFragment));
        }
      } catch (error) {
        LOGGER.error('Error assigning player:', String(error));
      }
    },
    [updateTeamMemberPosition, dispatch, displayedMatchupIdNum],
  );

  const handlePlayerRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      try {
        const assignedPlayer = teamMembers.find(
          (member: TeamMemberFragment) => member.positionId === position.id,
        );
        if (assignedPlayer?.id) {
          const result = await updateTeamMemberPosition({
            variables: { teamMemberId: assignedPlayer.id, positionId: null },
            ...(displayedMatchupIdNum && {
              refetchQueries: [
                {
                  query: GetMatchupPlayers,
                  variables: { matchupId: displayedMatchupIdNum },
                },
              ],
            }),
          });
          const updated = result.data?.updateTeamMemberPosition;
          if (updated) {
            dispatch(updateTeamMember(updated as TeamMemberFragment));
          }
        }
      } catch (error) {
        LOGGER.error('Error removing player:', String(error));
      }
    },
    [updateTeamMemberPosition, teamMembers, dispatch, displayedMatchupIdNum],
  );

  const handlePlayerSwap = useCallback(
    async (
      incomingPlayer: TeamMemberFragment,
      targetPosition: LeaguePositionFragment,
      displacedPlayer: TeamMemberFragment,
    ) => {
      if (!incomingPlayer.id || !displacedPlayer.id) {
        LOGGER.error('Player IDs are required for swap');
        return;
      }
      try {
        // Determine where to move the displaced player
        let displacedTargetPositionId: number | null = null;

        if (incomingPlayer.positionId) {
          // Incoming is from a lineup position — check if displaced can play there
          const incomingOldPosition = positions.find(
            (p) => p.id === incomingPlayer.positionId,
          );
          if (
            incomingOldPosition &&
            incomingOldPosition.id != null &&
            canPlayerPlayPosition(displacedPlayer, incomingOldPosition)
          ) {
            // Direct swap: displaced goes to incoming's old position
            displacedTargetPositionId = incomingOldPosition.id;
          }
          // else: displaced goes to bench (null)
        }
        // If incoming is from bench, displaced also goes to bench (null)

        // Atomic swap: both moves happen in a single transaction on the server
        const result = await swapTeamMemberPositions({
          variables: {
            teamMemberIdA: incomingPlayer.id,
            positionIdA: targetPosition.id,
            teamMemberIdB: displacedPlayer.id,
            positionIdB: displacedTargetPositionId,
          },
          ...(displayedMatchupIdNum && {
            refetchQueries: [
              {
                query: GetMatchupPlayers,
                variables: { matchupId: displayedMatchupIdNum },
              },
            ],
          }),
        });

        const swapped = result.data?.swapTeamMemberPositions;
        if (swapped) {
          for (const member of swapped) {
            dispatch(updateTeamMember(member as TeamMemberFragment));
          }
        }
      } catch (error) {
        LOGGER.error('Error swapping players:', String(error));
      }
    },
    [swapTeamMemberPositions, positions, dispatch, displayedMatchupIdNum],
  );

  const inviteUrl = useMemo(() => {
    if (!data?.league?.inviteCode) return null;
    const baseUrl = env.baseUrl.endsWith('/')
      ? env.baseUrl.slice(0, -1)
      : env.baseUrl;
    return `${window.location.origin}${baseUrl}/baseball/league/join/${data.league.inviteCode}`;
  }, [data?.league?.inviteCode]);

  const handleCopyInviteCode = useCallback(async () => {
    try {
      const inviteCode = data?.league?.inviteCode;
      if (!inviteCode) {
        alert('Invite code not available');
        return;
      }
      await navigator.clipboard.writeText(String(inviteCode));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      LOGGER.error('Error copying invite code:', String(error));
      alert('Failed to copy invite code to clipboard');
    }
  }, [data?.league?.inviteCode]);

  const handleCopyInviteLink = useCallback(async () => {
    try {
      if (!inviteUrl) {
        alert('Invite code not available');
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch (error) {
      LOGGER.error('Error copying invite link:', String(error));
      alert('Failed to copy invite link to clipboard');
    }
  }, [inviteUrl]);

  const handleCopyInviteHeader = useCallback(async () => {
    try {
      if (!inviteUrl) {
        alert('Invite code not available');
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      setHeaderInviteCopied(true);
      setTimeout(() => setHeaderInviteCopied(false), 2000);
    } catch (error) {
      LOGGER.error('Error copying invite link:', String(error));
      alert('Failed to copy invite link to clipboard');
    }
  }, [inviteUrl]);

  // ── Computed values ──

  const assignedCount = teamMembers.filter((p) => p?.positionId).length;
  const benchCount = teamMembers.length - assignedCount;
  const teamCount = leagueTeams.length;
  const draftColors = getDraftBadgeColors(String(league?.draftStatus));

  // ── Loading / Error States ──
  // Only show the full-page spinner until the core league data is available.
  // positionsLoading and teamMembersLoading are intentionally excluded here —
  // those datasets are only needed by the roster tab, which shows its own inline
  // loading state (LeagueRosterManagement `loading` prop). Including them here
  // caused the entire page to block for users on Overview, Standings, Matchup,
  // etc. while roster-specific data finished fetching. (LS-1065)
  const initialLoading = loading && !data;

  if (initialLoading) {
    return (
      <PageContainer>
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$10"
          gap="$4"
          role="main"
          aria-busy="true"
        >
          <Spinner size="large" color={BRAND_NAVY_LIGHT} />
          <Text
            color="$textMuted"
            fontSize="$4"
            role="status"
            aria-live="polite"
          >
            Loading league...
          </Text>
        </YStack>
      </PageContainer>
    );
  }

  if (error || !league) {
    return (
      <PageContainer>
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$10"
          gap="$5"
          role="main"
          aria-live="assertive"
        >
          <YStack
            backgroundColor="$red3"
            borderColor="$red7"
            borderWidth={1}
            borderRadius="$6"
            padding="$6"
            alignItems="center"
            gap="$3"
            maxWidth={480}
          >
            <Text color="$red11" fontSize="$6" fontWeight="700" role="alert">
              {error ? 'Something went wrong' : 'League not found'}
            </Text>
            <Text color="$red10" fontSize="$4" textAlign="center">
              {error
                ? error.message
                : "This league doesn't exist or you don't have access."}
            </Text>
            <Button
              marginTop="$2"
              onPress={() => navigate('/baseball')}
              aria-label="Back to leagues"
              backgroundColor="$red9"
              color="white"
              borderRadius="$4"
            >
              Back to Leagues
            </Button>
          </YStack>
        </YStack>
      </PageContainer>
    );
  }

  // ── Tab Content Renderers ──

  const renderOverview = () => (
    <YStack
      gap="$5"
      role="tabpanel"
      id="panel-overview"
      aria-labelledby="tab-overview"
    >
      {/* Draft In Progress Banner */}
      {league.draftStatus === 'in-progress' && (
        <DraftBanner role="alert" aria-label="Draft in progress">
          <XStack
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap="$3"
          >
            <XStack alignItems="center" gap="$3" flex={1}>
              <XStack
                backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                borderRadius="$10"
                padding="$2"
                alignItems="center"
                justifyContent="center"
              >
                <Zap
                  size={22}
                  color={BRAND_NAVY_LIGHT}
                  fill={BRAND_NAVY_LIGHT}
                />
              </XStack>
              <YStack gap="$1" flex={1}>
                <Text fontSize="$5" fontWeight="800" color={BRAND_GOLD_LIGHT}>
                  Draft Is Live!
                </Text>
                <Text fontSize="$3" color={BRAND_GOLD_LIGHT}>
                  Your league draft is in progress right now. Join before your
                  picks are auto-drafted.
                </Text>
              </YStack>
            </XStack>
            <Button
              backgroundColor={BRAND_NAVY_LIGHT}
              color="white"
              borderRadius="$4"
              onPress={() => navigate(`/baseball/league/${leagueId}/draft`)}
              pressStyle={{ scale: 0.97, opacity: 0.9 }}
              hoverStyle={{ backgroundColor: BRAND_NAVY }}
              animation="quick"
              size="$4"
              aria-label="Join draft room"
            >
              <XStack gap="$2" alignItems="center">
                <Zap size={14} color="white" />
                <Text color="white" fontWeight="700" fontSize="$3">
                  Join Draft Room
                </Text>
              </XStack>
            </Button>
          </XStack>
        </DraftBanner>
      )}

      {/* Commissioner Announcements (LS-291) — pinned at top of overview */}
      <CommissionerAnnouncementsPanel
        leagueId={leagueId}
        isCommissioner={isCommissioner}
      />

      {/* League Snapshot — unified glass stats bar */}
      <SnapshotBar
        style={{
          background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.18)} 0%, ${withAlpha(BG_DARK, 0.6)} 100%)`,
        }}
      >
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            Teams
          </Text>
          <Text fontSize="$8" fontWeight="800" color={BRAND_GOLD_LIGHT}>
            {teamCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            Roster Size
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$color">
            {league.maxRosterSize}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            My Starters
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$green11">
            {assignedCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            On Bench
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$amber11">
            {benchCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            Week
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$color">
            {currentWeek || '\u2014'}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1}
            fontWeight="600"
          >
            Positions
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$color">
            {positions.length}
          </Text>
        </SnapshotStat>
      </SnapshotBar>

      {/* Two-column dashboard layout */}
      <XStack gap="$5" flexWrap="wrap" alignItems="flex-start">
        {/* Main column */}
        <YStack flex={2} minWidth={260} gap="$5">
          {/* Matchup Preview */}
          {userCurrentMatchup && !matchupLoading && (
            <Card
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$6"
              padding="$5"
              animation="quick"
              hoverStyle={{
                borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
              }}
              style={{
                background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.08)} 0%, transparent 100%)`,
              }}
            >
              <XStack
                justifyContent="space-between"
                alignItems="center"
                marginBottom="$3"
              >
                <XStack alignItems="center" gap="$2">
                  <Swords size={18} color={BRAND_GOLD_LIGHT} />
                  <Text fontSize="$5" fontWeight="700" color="$color">
                    Current Matchup
                  </Text>
                </XStack>
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                  borderWidth={1}
                  borderRadius="$4"
                  color={BRAND_GOLD_LIGHT}
                  onPress={() => changeTab('matchup')}
                >
                  <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                    View Details
                  </Text>
                </Button>
              </XStack>
              <MatchupScoreboard
                matchup={userCurrentMatchup}
                gamesRemaining={
                  (userCurrentMatchup.gamesPerMatchup ?? 0) -
                  (userCurrentMatchup.selectedGamesCount ?? 0)
                }
                onTeamClick={handleViewTeamRoster}
              />
            </Card>
          )}

          {/* Activity / Chat / Scoring — section selector + swappable content */}
          <YStack gap="$0">
            {/* Tab strip */}
            <XStack
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$6"
              borderBottomLeftRadius={0}
              borderBottomRightRadius={0}
              borderBottomWidth={0}
              paddingHorizontal="$2"
            >
              {(
                [
                  {
                    id: 'activity',
                    label: 'Activity',
                    icon: <Clock size={14} />,
                  },
                  {
                    id: 'chat',
                    label: 'Chat',
                    icon: <MessageSquare size={14} />,
                  },
                  {
                    id: 'scoring',
                    label: 'Scoring',
                    icon: <BarChart3 size={14} />,
                  },
                ] as const
              ).map((st) => {
                const isActive = overviewSubTab === st.id;
                return (
                  <XStack
                    key={st.id}
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    gap="$1.5"
                    alignItems="center"
                    cursor="pointer"
                    borderBottomWidth={2}
                    borderBottomColor={
                      isActive ? BRAND_GOLD_LIGHT : 'transparent'
                    }
                    onPress={() => setOverviewSubTab(st.id)}
                    animation="quick"
                    hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
                  >
                    <XStack color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}>
                      {st.icon}
                    </XStack>
                    <Text
                      fontSize="$3"
                      fontWeight={isActive ? '700' : '500'}
                      color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                    >
                      {st.label}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>

            {/* Active section — each component renders its own Card */}
            {overviewSubTab === 'activity' && (
              <YStack
                maxHeight={480}
                overflow="auto"
                borderTopLeftRadius={0}
                borderTopRightRadius={0}
              >
                <LeagueActivityFeed
                  leagueId={leagueId}
                  draftStatus={String(league.draftStatus)}
                  currentMatchup={currentWeek ?? undefined}
                  teamCount={teamCount}
                />
              </YStack>
            )}

            {overviewSubTab === 'chat' && (
              <Card
                backgroundColor="$surfacePanel"
                borderColor="$surfacePanelBorder"
                borderWidth={1}
                borderRadius="$6"
                borderTopLeftRadius={0}
                borderTopRightRadius={0}
                overflow="hidden"
              >
                <YStack height={420}>
                  <LeagueChatTab
                    leagueId={leagueId}
                    userId={user?.id ?? 0}
                    mentionableTeams={leagueTeams}
                    onNavigate={(tabId) => changeTab(tabId as TabId)}
                  />
                </YStack>
              </Card>
            )}

            {overviewSubTab === 'scoring' && (
              <YStack
                maxHeight={480}
                overflow="auto"
                borderTopLeftRadius={0}
                borderTopRightRadius={0}
              >
                <LeagueScoringSummary
                  loading={scoringLoading}
                  error={scoringError}
                  profileName={scoringProfileName}
                  settings={scoringSettings}
                />
              </YStack>
            )}
          </YStack>
        </YStack>

        {/* Sidebar */}
        <YStack flex={1} minWidth={240} maxWidth={380} gap="$5">
          {/* League Status — compact info strip */}
          <SidebarCard>
            <XStack alignItems="center" gap="$2" marginBottom="$3">
              <Info size={18} color={BRAND_GOLD_LIGHT} />
              <Text fontSize="$5" fontWeight="700" color="$color">
                League Status
              </Text>
            </XStack>
            <XStack gap="$3" flexWrap="wrap">
              <DraftBadge
                backgroundColor={draftColors.bg}
                borderColor={draftColors.border}
              >
                <Text fontSize="$2" fontWeight="700" color={draftColors.text}>
                  {formatDraftStatus(String(league.draftStatus))}
                </Text>
              </DraftBadge>
              {currentWeek && (
                <XStack
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                  borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
                  borderWidth={1}
                  borderRadius="$10"
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                >
                  <Text fontSize="$2" fontWeight="700" color="$color">
                    Week {currentWeek}
                  </Text>
                </XStack>
              )}
              {isCommissioner && (
                <XStack
                  backgroundColor="$amber3"
                  borderColor="$amber7"
                  borderWidth={1}
                  borderRadius="$10"
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                >
                  <Text fontSize="$2" fontWeight="700" color="$amber11">
                    Commissioner
                  </Text>
                </XStack>
              )}
            </XStack>
          </SidebarCard>

          {/* Quick Standings */}
          {leagueTeams.length > 0 && (
            <SidebarCard data-testid="league-teams">
              <XStack
                justifyContent="space-between"
                alignItems="center"
                marginBottom="$3"
              >
                <XStack alignItems="center" gap="$2">
                  <Trophy size={18} color="var(--color)" />
                  <Text fontSize="$5" fontWeight="700" color="$color">
                    Teams
                  </Text>
                </XStack>
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                  borderWidth={1}
                  borderRadius="$4"
                  color={BRAND_GOLD_LIGHT}
                  onPress={() => changeTab('standings')}
                >
                  <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                    Full Standings
                  </Text>
                </Button>
              </XStack>
              <YStack gap="$1.5">
                {leagueTeams.slice(0, 6).map((team, idx) => (
                  <XStack
                    key={team.id}
                    justifyContent="space-between"
                    alignItems="center"
                    paddingVertical="$2.5"
                    paddingHorizontal="$3"
                    borderRadius="$4"
                    backgroundColor={
                      userTeamId === team.id
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                        : 'transparent'
                    }
                    borderWidth={1}
                    borderColor={
                      userTeamId === team.id
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
                        : 'transparent'
                    }
                    cursor="pointer"
                    hoverStyle={{
                      backgroundColor:
                        userTeamId === team.id
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.25)
                          : '$surfaceSubtle',
                      borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.2),
                    }}
                    pressStyle={{ scale: 0.98, opacity: 0.9 }}
                    onPress={() => handleViewTeamRoster(team.id)}
                    animation="quick"
                  >
                    <XStack alignItems="center" gap="$2.5">
                      <YStack
                        width={24}
                        height={24}
                        borderRadius={12}
                        backgroundColor="$surfaceSubtle"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize="$2" fontWeight="700" color="$textMuted">
                          {idx + 1}
                        </Text>
                      </YStack>
                      <AvatarImage
                        url={team.logoUrl}
                        username={team.name}
                        size={24}
                        borderRadius={4}
                      />
                      <Text
                        fontSize="$3"
                        fontWeight={userTeamId === team.id ? '700' : '500'}
                        color="$color"
                      >
                        {team.name}
                      </Text>
                    </XStack>
                    <XStack alignItems="center" gap="$2">
                      {userTeamId === team.id && (
                        <Text
                          fontSize="$1"
                          fontWeight="700"
                          color={BRAND_GOLD_LIGHT}
                        >
                          YOU
                        </Text>
                      )}
                      <Eye size={14} color="var(--textMuted)" />
                    </XStack>
                  </XStack>
                ))}
                {leagueTeams.length > 6 && (
                  <XStack
                    justifyContent="center"
                    marginTop="$2"
                    paddingVertical="$2"
                    borderRadius="$3"
                    cursor="pointer"
                    hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
                    onPress={() => changeTab('standings')}
                    animation="quick"
                  >
                    <Text
                      fontSize="$2"
                      color={BRAND_GOLD_LIGHT}
                      fontWeight="600"
                    >
                      +{leagueTeams.length - 6} more teams
                    </Text>
                  </XStack>
                )}
              </YStack>
            </SidebarCard>
          )}

          {/* Invite Friends */}
          <InviteCard>
            <XStack alignItems="center" gap="$2" marginBottom="$4">
              <UserPlus size={18} color={BRAND_GOLD_LIGHT} />
              <Text fontSize="$5" fontWeight="700" color="$color">
                Invite Friends
              </Text>
            </XStack>
            <YStack gap="$3">
              {/* Invite Link */}
              <YStack gap="$2">
                <Text
                  fontSize="$2"
                  color="$textMuted"
                  fontWeight="600"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Share Link
                </Text>
                <XStack gap="$2" alignItems="center">
                  <YStack
                    flex={1}
                    backgroundColor="$surfaceSubtle"
                    borderColor="$outlineSubtle"
                    borderWidth={1}
                    borderRadius="$3"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                  >
                    <Text
                      fontSize="$2"
                      color="$textMuted"
                      fontFamily="$mono"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {inviteUrl || 'Loading...'}
                    </Text>
                  </YStack>
                  <Button
                    size="$3"
                    backgroundColor={
                      inviteLinkCopied ? '$green9' : BRAND_NAVY_LIGHT
                    }
                    color="white"
                    borderRadius="$3"
                    onPress={handleCopyInviteLink}
                    icon={
                      inviteLinkCopied ? (
                        <Check size={16} />
                      ) : (
                        <Link2 size={16} />
                      )
                    }
                    aria-label="Copy invite link"
                  >
                    <Text fontSize="$2" fontWeight="600" color="white">
                      {inviteLinkCopied ? 'Copied' : 'Copy'}
                    </Text>
                  </Button>
                </XStack>
                <Text className="sr-only" aria-live="polite" role="status">
                  {inviteLinkCopied ? 'Invite link copied to clipboard' : ''}
                </Text>
              </YStack>

              <Separator borderColor="$outlineSubtle" />

              {/* Invite Code */}
              <YStack gap="$2">
                <Text
                  fontSize="$2"
                  color="$textMuted"
                  fontWeight="600"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Manual Code
                </Text>
                <XStack gap="$2" alignItems="center">
                  <YStack
                    flex={1}
                    backgroundColor="$surfaceSubtle"
                    borderColor="$outlineSubtle"
                    borderWidth={1}
                    borderRadius="$3"
                    paddingHorizontal="$3"
                    paddingVertical="$2.5"
                    alignItems="center"
                  >
                    <Text
                      fontSize="$6"
                      fontWeight="800"
                      color="$color"
                      fontFamily="$mono"
                      letterSpacing={3}
                    >
                      {league.inviteCode || '...'}
                    </Text>
                  </YStack>
                  <Button
                    size="$3"
                    backgroundColor={linkCopied ? '$green9' : BRAND_NAVY_LIGHT}
                    color="white"
                    borderRadius="$3"
                    onPress={handleCopyInviteCode}
                    icon={linkCopied ? <Check size={16} /> : <Copy size={16} />}
                    aria-label="Copy invite code"
                  >
                    <Text fontSize="$2" fontWeight="600" color="white">
                      {linkCopied ? 'Copied' : 'Copy'}
                    </Text>
                  </Button>
                </XStack>
                <Text className="sr-only" aria-live="polite" role="status">
                  {linkCopied ? 'Invite code copied to clipboard' : ''}
                </Text>
              </YStack>

              {/* QR Code Section */}
              <YStack gap="$2">
                <XStack alignItems="center" justifyContent="space-between">
                  <Text
                    fontSize="$2"
                    color="$textMuted"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    QR Code
                  </Text>
                  <Button
                    size="$2"
                    chromeless
                    onPress={() => setShowQRCode(!showQRCode)}
                    icon={<QrCode size={16} />}
                    aria-label={showQRCode ? 'Hide QR Code' : 'Show QR Code'}
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="600"
                      color={BRAND_GOLD_LIGHT}
                    >
                      {showQRCode ? 'Hide' : 'Show'}
                    </Text>
                  </Button>
                </XStack>
                {showQRCode && inviteUrl && (
                  <YStack
                    alignItems="center"
                    padding="$4"
                    backgroundColor="white"
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor="$outlineSubtle"
                  >
                    <QRCodeSVG
                      value={inviteUrl}
                      size={200}
                      level="M"
                      includeMargin
                    />
                    <Text
                      fontSize="$2"
                      color="$textMuted"
                      marginTop="$3"
                      textAlign="center"
                    >
                      Scan to join league
                    </Text>
                  </YStack>
                )}
              </YStack>
            </YStack>
          </InviteCard>

          {/* Trade Block */}
          <LeagueTradeBlock leagueId={leagueId} userTeamId={reduxUserTeamId} />
        </YStack>
      </XStack>
    </YStack>
  );

  const renderRosterManagement = () => {
    const isViewingOther = viewingTeamId !== null && !isViewingOwnTeam;

    // Week stepper helpers (only shown when viewing own roster)
    const weekStepperIndex = availableRosterWeeks.indexOf(
      rosterSelectedWeek ?? -1,
    );
    const canGoPrevWeek = weekStepperIndex > 0;
    const canGoNextWeek = weekStepperIndex < availableRosterWeeks.length - 1;
    const isOnCurrentWeek =
      rosterViewWeek === null || rosterViewWeek === currentWeek;

    const teamPlayersToShow = isViewingOther
      ? viewingTeamMembers
      : isViewingHistoricalRosterWeek && historicalTeamMembers.length > 0
        ? historicalTeamMembers
        : teamMembers;

    const rosterIsReadOnly = isViewingOther || isViewingHistoricalRosterWeek;

    return (
      <YStack
        gap="$5"
        role="tabpanel"
        id="panel-roster"
        aria-labelledby="tab-roster"
      >
        {isViewingOther && (
          <XStack
            alignItems="center"
            gap="$3"
            paddingVertical="$2"
            paddingHorizontal="$1"
          >
            <Button
              size="$3"
              backgroundColor={withAlpha(BRAND_NAVY, 0.14)}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
              borderWidth={1}
              borderRadius="$4"
              onPress={handleBackToMyRoster}
              icon={<ChevronLeft size={16} color={BRAND_GOLD_LIGHT} />}
              hoverStyle={{ backgroundColor: withAlpha(BRAND_NAVY, 0.22) }}
              pressStyle={{ scale: 0.97, opacity: 0.9 }}
              animation="quick"
            >
              <Text fontSize="$3" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                Back to My Roster
              </Text>
            </Button>
            <XStack alignItems="center" gap="$2">
              <Eye size={16} color="var(--textMuted)" />
              <Text fontSize="$3" color="$textMuted" fontStyle="italic">
                Viewing {viewingTeamName}&apos;s roster
              </Text>
            </XStack>
          </XStack>
        )}

        {/* ── Week Selector (own roster only, when league has multiple weeks) ── */}
        {!isViewingOther && availableRosterWeeks.length > 1 && (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            borderRadius="$5"
            paddingHorizontal="$4"
            paddingVertical="$3"
            gap="$3"
          >
            {/* Prev week */}
            <XStack
              alignItems="center"
              justifyContent="center"
              width={32}
              height={32}
              borderRadius="$4"
              cursor={canGoPrevWeek ? 'pointer' : 'default'}
              opacity={canGoPrevWeek ? 1 : 0.3}
              hoverStyle={
                canGoPrevWeek
                  ? { backgroundColor: '$surfaceInteractive' }
                  : undefined
              }
              pressStyle={canGoPrevWeek ? { scale: 0.95 } : undefined}
              onPress={() => {
                if (canGoPrevWeek) {
                  setRosterViewWeek(
                    availableRosterWeeks[weekStepperIndex - 1] ?? null,
                  );
                }
              }}
              aria-label="Previous week"
            >
              <ChevronLeft size={18} color="$textMuted" />
            </XStack>

            {/* Week label + matchup context */}
            <YStack flex={1} alignItems="center" gap="$0.5">
              <XStack alignItems="center" gap="$2">
                <Text fontSize="$4" fontWeight="700" color="$text">
                  {rosterSelectedWeek != null
                    ? `Week ${rosterSelectedWeek}`
                    : 'Current Week'}
                </Text>
                {isOnCurrentWeek && (
                  <XStack
                    backgroundColor="$green3"
                    borderColor="$green7"
                    borderWidth={1}
                    borderRadius="$10"
                    paddingHorizontal="$2"
                    paddingVertical="$0.5"
                  >
                    <Text fontSize="$2" color="$green11" fontWeight="600">
                      Current
                    </Text>
                  </XStack>
                )}
                {isViewingHistoricalRosterWeek && (
                  <XStack
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                    borderWidth={1}
                    borderRadius="$10"
                    paddingHorizontal="$2"
                    paddingVertical="$0.5"
                  >
                    <Text
                      fontSize="$2"
                      color={BRAND_GOLD_LIGHT}
                      fontWeight="600"
                    >
                      Historical
                    </Text>
                  </XStack>
                )}
              </XStack>
              {rosterWeekMatchup && rosterOpponentTeam && (
                <Text fontSize="$3" color="$textMuted">
                  vs {rosterOpponentTeam.name}
                </Text>
              )}
              {rosterWeekMatchup && !rosterOpponentTeam && (
                <Text fontSize="$3" color="$textMuted">
                  Matchup week
                </Text>
              )}
            </YStack>

            {/* Reset to current week */}
            {!isOnCurrentWeek && (
              <XStack
                alignItems="center"
                gap="$1"
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius="$4"
                backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                borderWidth={1}
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                cursor="pointer"
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.22),
                }}
                pressStyle={{ scale: 0.97 }}
                onPress={() => setRosterViewWeek(null)}
                aria-label="Back to current week"
              >
                <ArrowLeftRight size={12} color={BRAND_GOLD_LIGHT} />
                <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                  Current
                </Text>
              </XStack>
            )}

            {/* Next week */}
            <XStack
              alignItems="center"
              justifyContent="center"
              width={32}
              height={32}
              borderRadius="$4"
              cursor={canGoNextWeek ? 'pointer' : 'default'}
              opacity={canGoNextWeek ? 1 : 0.3}
              hoverStyle={
                canGoNextWeek
                  ? { backgroundColor: '$surfaceInteractive' }
                  : undefined
              }
              pressStyle={canGoNextWeek ? { scale: 0.95 } : undefined}
              onPress={() => {
                if (canGoNextWeek) {
                  setRosterViewWeek(
                    availableRosterWeeks[weekStepperIndex + 1] ?? null,
                  );
                }
              }}
              aria-label="Next week"
            >
              <ChevronRight size={18} color="$textMuted" />
            </XStack>
          </XStack>
        )}

        {/* Historical mode info banner */}
        {!isViewingOther && isViewingHistoricalRosterWeek && (
          <XStack
            alignItems="center"
            gap="$2"
            paddingVertical="$2"
            paddingHorizontal="$3"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
            borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
            borderWidth={1}
            borderRadius="$4"
          >
            <Info size={14} color="$textMuted" />
            <Text fontSize="$2" color="$textMuted">
              Showing the frozen lineup used for Week {rosterSelectedWeek}.
              Switch to the current week to edit your roster.
            </Text>
          </XStack>
        )}

        {/* Future week info banner */}
        {!isViewingOther &&
          !isViewingHistoricalRosterWeek &&
          rosterViewWeek !== null &&
          rosterViewWeek !== currentWeek && (
            <XStack
              alignItems="center"
              gap="$2"
              paddingVertical="$2"
              paddingHorizontal="$3"
              backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
              borderWidth={1}
              borderRadius="$4"
            >
              <Info size={14} color="$textMuted" />
              <Text fontSize="$2" color="$textMuted">
                Your current lineup will be used for Week {rosterViewWeek}. Any
                changes you make here apply to all future matchups.
              </Text>
            </XStack>
          )}

        {!isViewingOther && userTeamId && isOnCurrentWeek && (
          <PendingWaiverClaims teamId={userTeamId} />
        )}

        {!isViewingOther && userTeamId && isOnCurrentWeek && (
          <PendingTradeOffers teamId={userTeamId} leagueId={leagueId} />
        )}

        <LeagueRosterManagement
          positions={positions}
          teamPlayers={teamPlayersToShow}
          onPlayerAssign={(player, position) =>
            void handlePlayerAssign(player, position)
          }
          onPlayerRemove={(player) => void handlePlayerRemove(player)}
          onPlayerSwap={(incoming, targetPos, displaced) =>
            void handlePlayerSwap(incoming, targetPos, displaced)
          }
          loading={
            isViewingOther
              ? viewingTeamMembersLoading
              : isViewingHistoricalRosterWeek
                ? historicalRosterLoading
                : positionsLoading ||
                  teamMembersLoading ||
                  userTeamLoading ||
                  // LS-1243: The getUserTeamId lazy query hasn't returned yet,
                  // so teamMembers is skipped (userTeamId is null) and both
                  // teamMembersLoading and userTeamLoading are false. Without
                  // this guard the roster renders with 0 players before the
                  // real data arrives.
                  (!userTeamId && userTeamData === undefined && !!user?.id)
          }
          playerMatchupData={
            isViewingHistoricalRosterWeek ? undefined : playerMatchupDataMap
          }
          readOnly={rosterIsReadOnly}
          teamName={isViewingOther ? viewingTeamName : undefined}
          minCareerGames={
            isViewingHistoricalRosterWeek
              ? undefined
              : (league.minCareerGames ?? 50)
          }
          minCareerSeasons={
            isViewingHistoricalRosterWeek
              ? undefined
              : (league.minCareerSeasons ?? 3)
          }
        />
      </YStack>
    );
  };

  const renderTeamSettings = () => {
    const userTeam = leagueTeams.find((t) => t.id === userTeamId);
    const currentName = String(userTeam?.name ?? '');

    const startEditing = () => {
      setRenameInput(currentName);
      setRenameError(null);
      setRenameSuccess(false);
      setRenameEditing(true);
    };

    const cancelEditing = () => {
      setRenameEditing(false);
      setRenameInput('');
      setRenameError(null);
    };

    const handleRename = async () => {
      if (!userTeamId || !renameInput.trim()) return;
      setRenameError(null);
      try {
        await renameTeamMutation({
          variables: {
            teamId: userTeamId,
            leagueId,
            newName: renameInput.trim(),
          },
        });
        setRenameEditing(false);
        setRenameInput('');
        setRenameSuccess(true);
        void refetchLeague();
        void getLeagueTeams({ variables: { leagueId } });
        setTimeout(() => setRenameSuccess(false), 4000);
      } catch (err) {
        setRenameError(
          err instanceof Error ? err.message : 'Failed to rename team',
        );
      }
    };

    return (
      <YStack
        gap="$6"
        padding="$4"
        maxWidth={640}
        role="tabpanel"
        id="panel-team-settings"
        aria-labelledby="tab-team-settings"
      >
        <Card
          backgroundColor="$surfacePanel"
          borderColor="$surfacePanelBorder"
          borderWidth={1}
          borderRadius="$6"
          padding="$6"
        >
          <YStack gap="$4">
            <XStack alignItems="center" gap="$3">
              <Edit3 size={20} color={BRAND_NAVY_LIGHT} />
              <Text fontSize="$6" fontWeight="700" color="$text">
                Team Settings
              </Text>
            </XStack>
            <Separator />

            <YStack gap="$2">
              <Text fontSize="$3" color="$textMuted" fontWeight="600">
                Team Name
              </Text>

              {renameEditing ? (
                <YStack gap="$3">
                  <input
                    autoFocus
                    type="text"
                    value={renameInput}
                    onChange={(e) => {
                      setRenameInput(e.target.value);
                      setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRename();
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    maxLength={100}
                    disabled={renaming}
                    style={{
                      backgroundColor: 'var(--color2)',
                      border: `1px solid ${BRAND_NAVY_LIGHT}`,
                      borderRadius: '8px',
                      color: 'var(--color12)',
                      fontSize: '16px',
                      fontWeight: '600',
                      padding: '8px 12px',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                      opacity: renaming ? 0.6 : 1,
                    }}
                  />
                  {renameError && (
                    <Text color="$red10" fontSize="$3">
                      {renameError}
                    </Text>
                  )}
                  <XStack gap="$2">
                    <Button
                      size="$3"
                      backgroundColor={BRAND_NAVY_LIGHT}
                      borderRadius="$4"
                      disabled={renaming || !renameInput.trim()}
                      onPress={() => void handleRename()}
                    >
                      {renaming ? (
                        <XStack alignItems="center" gap="$2">
                          <Spinner size="small" color="white" />
                          <Text fontWeight="600" color="white" fontSize="$3">
                            Saving…
                          </Text>
                        </XStack>
                      ) : (
                        <XStack alignItems="center" gap="$2">
                          <Check size={14} color="white" />
                          <Text fontWeight="600" color="white" fontSize="$3">
                            Save
                          </Text>
                        </XStack>
                      )}
                    </Button>
                    <Button
                      size="$3"
                      backgroundColor="$gray4"
                      borderRadius="$4"
                      disabled={renaming}
                      onPress={cancelEditing}
                    >
                      <XStack alignItems="center" gap="$2">
                        <X size={14} color="var(--color11)" />
                        <Text fontWeight="600" color="$color11" fontSize="$3">
                          Cancel
                        </Text>
                      </XStack>
                    </Button>
                  </XStack>
                </YStack>
              ) : (
                <XStack alignItems="center" gap="$3">
                  <Text fontSize="$5" fontWeight="600" color="$text">
                    {currentName || '—'}
                  </Text>
                  {renameSuccess ? (
                    <XStack alignItems="center" gap="$1">
                      <Check size={14} color="var(--green10)" />
                      <Text color="$green10" fontSize="$2">
                        Saved
                      </Text>
                    </XStack>
                  ) : (
                    <Button
                      size="$2"
                      backgroundColor="transparent"
                      borderWidth={1}
                      borderColor="$color5"
                      borderRadius="$3"
                      onPress={startEditing}
                      paddingHorizontal="$2"
                    >
                      <XStack alignItems="center" gap="$1">
                        <Edit3 size={12} color="var(--color10)" />
                        <Text fontSize="$2" color="$color10" fontWeight="600">
                          Edit
                        </Text>
                      </XStack>
                    </Button>
                  )}
                </XStack>
              )}
            </YStack>
          </YStack>
        </Card>

        {/* ── Team Branding ── */}
        <Card
          bordered
          padding="$4"
          borderRadius="$5"
          gap="$4"
          backgroundColor="$surface2"
        >
          <YStack gap="$1">
            <Text fontSize="$5" fontWeight="700" color={BRAND_GOLD_LIGHT}>
              Team Branding
            </Text>
            <Text fontSize="$2" color="$gray10">
              Set a logo and team colors that appear in standings and matchups.
            </Text>
          </YStack>

          <Separator />

          {/* Logo */}
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="600">
              Team Logo
            </Text>
            <AvatarPicker
              variant="team"
              currentUrl={
                leagueTeamsData?.leagueTeams?.find((t) => t.id === userTeamId)
                  ?.logoUrl ?? null
              }
              username={leagueTeams.find((t) => t.id === userTeamId)?.name}
              onSelect={(url) => {
                if (!userTeamId) return;
                void updateTeamBranding({
                  variables: { teamId: userTeamId, leagueId, logoUrl: url },
                });
              }}
              loading={teamBrandingLoading}
            />
          </YStack>

          <Separator />

          {/* Colors */}
          <YStack gap="$3">
            <Text fontSize="$3" fontWeight="600">
              Team Colors
            </Text>
            {(() => {
              const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
              const primaryError =
                teamPrimaryColor !== '' && !HEX_RE.test(teamPrimaryColor)
                  ? 'Must be a hex color like #1A2B3C'
                  : null;
              const secondaryError =
                teamSecondaryColor !== '' && !HEX_RE.test(teamSecondaryColor)
                  ? 'Must be a hex color like #1A2B3C'
                  : null;
              const hasErrors = !!(primaryError ?? secondaryError);

              const handleColorsSave = async () => {
                if (!userTeamId || hasErrors) return;
                setTeamColorSuccess(false);
                setTeamColorError(null);
                try {
                  await updateTeamBranding({
                    variables: {
                      teamId: userTeamId,
                      leagueId,
                      primaryColor: teamPrimaryColor || null,
                      secondaryColor: teamSecondaryColor || null,
                    },
                  });
                  setTeamColorSuccess(true);
                  setTimeout(() => setTeamColorSuccess(false), 4000);
                } catch (err) {
                  setTeamColorError(
                    err instanceof Error
                      ? err.message
                      : 'Failed to save colors',
                  );
                }
              };

              return (
                <>
                  <XStack gap="$4" flexWrap="wrap">
                    <YStack gap="$1" flex={1} minWidth={160}>
                      <Label
                        htmlFor="team-primary-color"
                        fontSize="$2"
                        fontWeight="600"
                      >
                        Primary Color
                      </Label>
                      <XStack gap="$2" alignItems="center">
                        <YStack
                          width={32}
                          height={32}
                          borderRadius="$2"
                          borderWidth={1}
                          borderColor="$gray6"
                          backgroundColor={
                            HEX_RE.test(teamPrimaryColor)
                              ? teamPrimaryColor
                              : '$gray4'
                          }
                          flexShrink={0}
                        />
                        <Input
                          id="team-primary-color"
                          flex={1}
                          placeholder="#1A2B3C"
                          value={teamPrimaryColor}
                          onChangeText={(v: string) => {
                            setTeamPrimaryColor(v);
                            setTeamColorError(null);
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={7}
                          borderColor={primaryError ? '$red8' : undefined}
                        />
                      </XStack>
                      {primaryError && (
                        <Text fontSize="$1" color="$red10">
                          {primaryError}
                        </Text>
                      )}
                    </YStack>
                    <YStack gap="$1" flex={1} minWidth={160}>
                      <Label
                        htmlFor="team-secondary-color"
                        fontSize="$2"
                        fontWeight="600"
                      >
                        Secondary Color
                      </Label>
                      <XStack gap="$2" alignItems="center">
                        <YStack
                          width={32}
                          height={32}
                          borderRadius="$2"
                          borderWidth={1}
                          borderColor="$gray6"
                          backgroundColor={
                            HEX_RE.test(teamSecondaryColor)
                              ? teamSecondaryColor
                              : '$gray4'
                          }
                          flexShrink={0}
                        />
                        <Input
                          id="team-secondary-color"
                          flex={1}
                          placeholder="#FFFFFF"
                          value={teamSecondaryColor}
                          onChangeText={(v: string) => {
                            setTeamSecondaryColor(v);
                            setTeamColorError(null);
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={7}
                          borderColor={secondaryError ? '$red8' : undefined}
                        />
                      </XStack>
                      {secondaryError && (
                        <Text fontSize="$1" color="$red10">
                          {secondaryError}
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                  <XStack gap="$3" alignItems="center">
                    <Button
                      size="$3"
                      backgroundColor={BRAND_NAVY_LIGHT}
                      color={WHITE}
                      borderRadius="$3"
                      disabled={teamBrandingLoading || hasErrors}
                      opacity={teamBrandingLoading || hasErrors ? 0.6 : 1}
                      onPress={() => void handleColorsSave()}
                    >
                      {teamBrandingLoading ? (
                        <XStack alignItems="center" gap="$2">
                          <Spinner size="small" color="white" />
                          <Text fontWeight="600" color="white" fontSize="$3">
                            Saving…
                          </Text>
                        </XStack>
                      ) : (
                        'Save Colors'
                      )}
                    </Button>
                    {teamColorSuccess && (
                      <XStack alignItems="center" gap="$1">
                        <Check size={14} color="var(--green10)" />
                        <Text color="$green10" fontSize="$2">
                          Saved
                        </Text>
                      </XStack>
                    )}
                    {teamColorError && (
                      <Text color="$red10" fontSize="$2">
                        {teamColorError}
                      </Text>
                    )}
                  </XStack>
                </>
              );
            })()}
          </YStack>
        </Card>
      </YStack>
    );
  };

  const renderCommissionerSettings = () => {
    const isOpen = (id: string) => commissionerOpenSections.has(id);

    const sections: Array<{
      id: string;
      title: string;
      content: React.ReactNode;
    }> = [
      {
        id: 'next-step',
        title: 'Next Step',
        content: matchupLoading ? (
          <Card
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            padding="$6"
            borderRadius="$6"
          >
            <YStack gap="$3" alignItems="center">
              <Spinner size="large" />
              <Text color="$textMuted">Loading matchup data...</Text>
            </YStack>
          </Card>
        ) : matchupError ? (
          <Card
            backgroundColor="$red2"
            borderColor="$red6"
            padding="$4"
            borderRadius="$6"
          >
            <Text color="$red11">
              Error loading matchup: {matchupError.message}
            </Text>
          </Card>
        ) : (
          <NextStepControl
            leagueId={leagueId}
            currentMatchup={userCurrentMatchup}
            gamesPerMatchup={
              userCurrentMatchup?.gamesPerMatchup ?? league.gamesPerMatchup ?? 1
            }
            draftStatus={league.draftStatus}
            hasPendingSettingsChanges={hasDraftSettingsChanges}
            leagueName={league.name ?? 'Unknown League'}
            frozenAt={league.frozenAt}
            totalMatchups={league.totalMatchups ?? undefined}
            onSuccess={handleMatchupSuccess}
            onError={handleMatchupError}
            onLeagueUpdate={handleLeagueUpdate}
          />
        ),
      },
      {
        id: 'draft-settings',
        title: 'Draft Settings',
        content: (
          <DraftSettingsControl
            leagueId={leagueId}
            draftStatus={league.draftStatus}
            playerPool={league.playerPool}
            eraFilter={league.eraFilter}
            hofOnly={league.hofOnly}
            customEraStartYear={league.customEraStartYear}
            customEraEndYear={league.customEraEndYear}
            onDirtyChange={setHasDraftSettingsChanges}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'draft-order',
        title: 'Draft Pick Order',
        content: (
          <DraftOrderControl
            leagueId={leagueId}
            draftStatus={league.draftStatus}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'league-branding',
        title: 'League Branding',
        content: (
          <LeagueBrandingControl
            leagueId={leagueId}
            leagueName={league.name}
            currentLogoUrl={league.logoUrl}
            currentBannerUrl={league.bannerUrl}
            currentPrimaryColor={league.primaryColor}
            currentSecondaryColor={league.secondaryColor}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'league-settings',
        title: 'League Settings',
        content: (
          <LeagueSettingsControl
            leagueId={leagueId}
            draftStatus={league.draftStatus}
            currentGamesPerMatchup={league.gamesPerMatchup ?? 5}
            currentSpStartsPerMatchup={league.spStartsPerMatchup ?? 1}
            currentMinCareerGames={league.minCareerGames ?? 50}
            currentMinCareerSeasons={league.minCareerSeasons ?? 3}
            currentTotalMatchups={league.totalMatchups ?? 10}
            currentPlayoffEnabled={league.playoffEnabled ?? true}
            currentPlayoffFormat={league.playoffFormat ?? '4-team'}
            currentPlayoffMultiWeek={league.playoffMultiWeek ?? false}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'season-awards',
        title: 'Season Awards',
        content: (
          <SeasonAwardsControl
            leagueId={leagueId}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'achievement-restrictions',
        title: 'Achievement Restrictions',
        content: (
          <AchievementRestrictionsControl
            leagueId={leagueId}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'waiver-processing',
        title: 'Waiver Processing',
        content: (
          <WaiverProcessControl
            leagueId={leagueId}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'scoring',
        title: 'Scoring',
        content: (
          <LeagueScoringEditor
            leagueId={leagueId}
            draftStatus={league.draftStatus}
            profile={scoringProfile}
            loading={scoringLoading}
            error={scoringError}
            onRefetch={async () => {
              await refetchScoringProfile({ leagueId });
            }}
          />
        ),
      },
      {
        id: 'danger-zone',
        title: 'Danger Zone',
        content: (
          <DeleteLeagueControl
            leagueId={leagueId}
            leagueName={league.name ?? 'Unknown League'}
            onSuccess={() => {
              // Handled by DeleteLeagueControl
            }}
            onError={(deleteError) => {
              LOGGER.error('Delete league error:', String(deleteError));
              setMatchupErrorMessage(deleteError.message);
            }}
          />
        ),
      },
    ];

    return (
      <YStack
        gap="$2"
        role="tabpanel"
        id="panel-commissioner"
        aria-labelledby="tab-commissioner"
      >
        {matchupSuccessMessage && (
          <Card
            role="status"
            aria-live="polite"
            backgroundColor="$green3"
            borderColor="$green8"
            padding="$3"
            borderRadius="$4"
          >
            <Text color="$green11" fontWeight="bold">
              {matchupSuccessMessage}
            </Text>
          </Card>
        )}

        {matchupErrorMessage && (
          <Card
            role="alert"
            aria-live="assertive"
            backgroundColor="$red3"
            borderColor="$red8"
            padding="$3"
            borderRadius="$4"
          >
            <Text color="$red11" fontWeight="bold">
              Error: {matchupErrorMessage}
            </Text>
          </Card>
        )}

        {sections.map(({ id, title, content }) => {
          const open = isOpen(id);
          const sectionId = `commissioner-section-${id}`;
          return (
            <YStack key={id}>
              <CommissionerSectionHeader
                data-testid={`commissioner-section-toggle-${id}`}
                onPress={() => toggleCommissionerSection(id)}
                role="button"
                aria-expanded={open}
                aria-controls={sectionId}
                borderBottomLeftRadius={open ? 0 : '$5'}
                borderBottomRightRadius={open ? 0 : '$5'}
                borderBottomWidth={open ? 0 : 1}
              >
                <Text fontWeight="700" fontSize="$4" color="$color">
                  {title}
                </Text>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <ChevronDown size={16} color="$colorPress" />
                </span>
              </CommissionerSectionHeader>
              {open && (
                <YStack
                  id={sectionId}
                  role="region"
                  aria-label={title}
                  borderLeftWidth={1}
                  borderRightWidth={1}
                  borderBottomWidth={1}
                  borderColor="$glassBorder"
                  borderBottomLeftRadius="$5"
                  borderBottomRightRadius="$5"
                  backgroundColor="$surfacePanel"
                  overflow="hidden"
                >
                  {content}
                </YStack>
              )}
            </YStack>
          );
        })}
      </YStack>
    );
  };

  // ── Render ──

  return (
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <PageContainer role="main" aria-labelledby="league-title">
        <PageMeta
          title={league.name ?? 'League'}
          description={`Manage your ${league.name ?? 'fantasy baseball'} league on Legacy Sports — view rosters, standings, matchups, and trades.`}
        />

        {/* Subtle refresh indicator — shown during background refetches triggered
            by WebSocket events so the user knows data is updating without
            replacing the entire page with a spinner. */}
        {isRefreshing && (
          <XStack
            alignItems="center"
            justifyContent="center"
            gap="$2"
            paddingVertical="$1.5"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
            animation="quick"
            enterStyle={{ opacity: 0, y: -8 }}
            exitStyle={{ opacity: 0, y: -8 }}
            role="status"
            aria-live="polite"
          >
            <Spinner size="small" color={BRAND_NAVY_LIGHT} />
            <Text fontSize="$2" fontWeight="600" color={BRAND_NAVY_LIGHT}>
              Updating...
            </Text>
          </XStack>
        )}

        {/* Hero Header */}
        <HeroBar
          style={{
            background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.95)} 0%, ${withAlpha(BRAND_NAVY, 0.55)} 100%)`,
          }}
        >
          <XStack alignItems="center" gap="$4" flex={1} flexWrap="wrap">
            <Button
              size="$3"
              backgroundColor={withAlpha(WHITE, 0.08)}
              borderColor={withAlpha(WHITE, 0.15)}
              borderWidth={1}
              borderRadius="$4"
              onPress={() => navigate('/baseball')}
              icon={<ChevronLeft size={18} color="white" />}
              aria-label="Back to leagues"
              hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.14) }}
            />
            <YStack gap="$1">
              <H1
                id="league-title"
                data-testid="league-title"
                fontSize="$8"
                fontWeight="800"
                color="white"
                lineHeight="$8"
              >
                {league.name}
              </H1>
              <XStack alignItems="center" gap="$3">
                <XStack alignItems="center" gap="$1.5">
                  <Users size={14} color={withAlpha(WHITE, 0.65)} />
                  <Text fontSize="$3" color={withAlpha(WHITE, 0.75)}>
                    {teamCount} teams
                  </Text>
                </XStack>
                <Text fontSize="$3" color={withAlpha(WHITE, 0.45)}>
                  |
                </Text>
                <DraftBadge
                  data-testid="draft-status"
                  backgroundColor={draftColors.bg}
                  borderColor={draftColors.border}
                >
                  <Text fontSize="$2" fontWeight="700" color={draftColors.text}>
                    {formatDraftStatus(String(league.draftStatus))}
                  </Text>
                </DraftBadge>
                {currentWeek && (
                  <>
                    <Text fontSize="$3" color={withAlpha(WHITE, 0.45)}>
                      |
                    </Text>
                    <Text fontSize="$3" color={withAlpha(WHITE, 0.75)}>
                      Week {currentWeek}
                    </Text>
                  </>
                )}
              </XStack>
            </YStack>
          </XStack>

          {/* Header quick-share */}
          <XStack gap="$2">
            <Button
              size="$3"
              backgroundColor={withAlpha(BRAND_NAVY, 0.2)}
              borderColor={withAlpha(BRAND_NAVY, 0.48)}
              borderWidth={1}
              borderRadius="$4"
              onPress={handleCopyInviteHeader}
              icon={
                headerInviteCopied ? (
                  <Check size={16} color="rgb(34, 197, 94)" />
                ) : (
                  <Share2 size={16} color={BRAND_GOLD_LIGHT} />
                )
              }
              hoverStyle={{ backgroundColor: withAlpha(BRAND_NAVY, 0.3) }}
              aria-label="Share invite link"
            >
              <Text
                fontSize="$3"
                fontWeight="600"
                color={headerInviteCopied ? '$green11' : BRAND_GOLD_LIGHT}
              >
                {headerInviteCopied ? 'Copied!' : 'Invite'}
              </Text>
            </Button>
          </XStack>
        </HeroBar>

        {/* Spectator Banner — shown when viewing a public league without membership */}
        {isSpectator && (
          <YStack
            backgroundColor={withAlpha(BRAND_NAVY, 0.08)}
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
            paddingHorizontal="$5"
            paddingVertical="$3"
          >
            <XStack
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              gap="$3"
            >
              <XStack alignItems="center" gap="$2">
                <Eye size={16} color={BRAND_NAVY_LIGHT} />
                <Text fontSize="$3" color={BRAND_NAVY_LIGHT} fontWeight="600">
                  Spectator Mode — you are viewing this public league without a
                  team
                </Text>
              </XStack>
              {!showSpectatorJoin && !spectatorJoinSuccess && (
                <Button
                  size="$3"
                  backgroundColor={BRAND_NAVY_LIGHT}
                  color="white"
                  borderRadius="$4"
                  onPress={() => setShowSpectatorJoin(true)}
                  pressStyle={{ scale: 0.97 }}
                  aria-label="Join this league"
                >
                  <XStack gap="$2" alignItems="center">
                    <UserPlus size={14} color="white" />
                    <Text color="white" fontWeight="700" fontSize="$3">
                      Join League
                    </Text>
                  </XStack>
                </Button>
              )}
              {spectatorJoinSuccess && (
                <XStack alignItems="center" gap="$2">
                  <Check size={16} color="$green9" />
                  <Text fontSize="$3" color="$green9" fontWeight="600">
                    Joined!
                  </Text>
                </XStack>
              )}
            </XStack>
            {showSpectatorJoin && !spectatorJoinSuccess && (
              <YStack marginTop="$3" gap="$2">
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  <input
                    placeholder="Enter your team name"
                    value={spectatorTeamName}
                    onChange={(e) => setSpectatorTeamName(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
                      fontSize: 14,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'inherit',
                      outline: 'none',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSpectatorJoin();
                    }}
                    aria-label="Team name"
                  />
                  <Button
                    size="$3"
                    backgroundColor={BRAND_NAVY_LIGHT}
                    color="white"
                    borderRadius="$4"
                    onPress={() => void handleSpectatorJoin()}
                    disabled={joiningLeague}
                    pressStyle={{ scale: 0.97 }}
                    aria-label="Confirm join"
                  >
                    {joiningLeague ? (
                      <Spinner size="small" color="white" />
                    ) : (
                      <Text color="white" fontWeight="700" fontSize="$3">
                        Confirm
                      </Text>
                    )}
                  </Button>
                  <Button
                    size="$3"
                    chromeless
                    onPress={() => {
                      setShowSpectatorJoin(false);
                      setSpectatorJoinError(null);
                    }}
                    aria-label="Cancel"
                  >
                    <X size={16} />
                  </Button>
                </XStack>
                {spectatorJoinError && (
                  <Text fontSize="$3" color="$red10">
                    {spectatorJoinError}
                  </Text>
                )}
              </YStack>
            )}
          </YStack>
        )}

        {/* Tab Navigation */}
        <TabBar role="tablist" aria-label="League sections">
          {TABS.map((tab) => {
            if (tab.commissionerOnly && !isCommissioner) return null;
            const isActive = activeTab === tab.id;
            // Dynamic roster tab label when viewing another team
            const label =
              tab.id === 'roster' && viewingTeamId && !isViewingOwnTeam
                ? (viewingTeamName ?? 'Team Roster')
                : tab.label;
            const icon =
              tab.id === 'roster' && viewingTeamId && !isViewingOwnTeam ? (
                <Eye size={16} />
              ) : (
                tab.icon
              );
            // Get visible tabs for keyboard navigation
            const visibleTabs = TABS.filter(
              (t) => !t.commissionerOnly || isCommissioner,
            );
            return (
              <Button
                key={tab.id}
                backgroundColor="transparent"
                borderWidth={0}
                borderBottomWidth={2}
                borderBottomColor={isActive ? BRAND_NAVY_LIGHT : 'transparent'}
                borderRadius={0}
                paddingHorizontal="$4"
                paddingVertical="$3"
                tabIndex={isActive ? 0 : -1}
                onPress={() => {
                  if (tab.id === 'roster') {
                    // Clicking the roster tab resets to viewing own roster
                    setViewingTeamId(null);
                  }
                  changeTab(tab.id);
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                  const currentIndex = visibleTabs.findIndex(
                    (t) => t.id === tab.id,
                  );
                  let targetIndex = -1;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    targetIndex = (currentIndex + 1) % visibleTabs.length;
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    targetIndex =
                      (currentIndex - 1 + visibleTabs.length) %
                      visibleTabs.length;
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    targetIndex = 0;
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    targetIndex = visibleTabs.length - 1;
                  }
                  if (targetIndex >= 0) {
                    const targetTab = visibleTabs[targetIndex];
                    changeTab(targetTab.id);
                    // Move focus to the target tab
                    const el = document.getElementById(`tab-${targetTab.id}`);
                    el?.focus();
                  }
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY, 0.08),
                }}
                pressStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY, 0.14),
                }}
              >
                <XStack alignItems="center" gap="$2">
                  <YStack opacity={isActive ? 1 : 0.5}>{icon}</YStack>
                  <Text
                    fontSize="$3"
                    fontWeight={isActive ? '700' : '500'}
                    color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                  >
                    {label}
                  </Text>
                </XStack>
              </Button>
            );
          })}
        </TabBar>

        {/* Tab Content */}
        <ContentArea marginTop="$5">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'roster' && renderRosterManagement()}
          {activeTab === 'free-agents' && (
            <YStack
              role="tabpanel"
              id="panel-free-agents"
              aria-labelledby="tab-free-agents"
            >
              <LeagueFreeAgents
                leagueId={leagueId}
                gamesPerMatchup={userCurrentMatchup?.gamesPerMatchup ?? 5}
              />
            </YStack>
          )}
          {activeTab === 'standings' && (
            <YStack
              role="tabpanel"
              id="panel-standings"
              aria-labelledby="tab-standings"
              gap="$4"
            >
              <LeagueStandings
                leagueId={leagueId}
                teams={leagueTeams}
                loading={leagueTeamsLoading}
                userTeamId={userTeamId}
                waiverType={league?.waiverType}
                onTeamClick={handleViewTeamRoster}
              />
              {(bracketLoading || bracketData?.getPlayoffBracket) && (
                <>
                  <Separator />
                  {bracketLoading ? (
                    <XStack justifyContent="center" padding="$4">
                      <Spinner size="small" />
                    </XStack>
                  ) : bracketData?.getPlayoffBracket ? (
                    <PlayoffBracketDisplay
                      bracket={bracketData.getPlayoffBracket}
                    />
                  ) : null}
                </>
              )}
            </YStack>
          )}
          {activeTab === 'matchup' && (
            <YStack
              role="tabpanel"
              id="panel-matchup"
              aria-labelledby="tab-matchup"
              gap="$4"
            >
              {matchupLoading ? (
                <Card
                  backgroundColor="$surfacePanel"
                  borderColor="$surfacePanelBorder"
                  borderWidth={1}
                  padding="$6"
                  borderRadius="$6"
                >
                  <YStack gap="$3" alignItems="center">
                    <Spinner size="large" />
                    <Text color="$textMuted">Loading matchup...</Text>
                  </YStack>
                </Card>
              ) : matchupError ? (
                <Card
                  backgroundColor="$red2"
                  borderColor="$red6"
                  borderWidth={1}
                  padding="$4"
                  borderRadius="$6"
                >
                  <Text color="$red11">
                    Error loading matchup: {matchupError.message}
                  </Text>
                </Card>
              ) : displayedMatchup ? (
                <YStack gap="$4">
                  {/* Matchup Navigation */}
                  <MatchupNavigationControls
                    currentMatchup={displayedMatchup}
                    currentLeagueWeek={currentWeek ?? undefined}
                    leagueId={leagueId}
                    allMatchups={allLeagueMatchups}
                    userTeamId={reduxUserTeamId}
                    isViewingOther={
                      selectedMatchupId != null &&
                      selectedMatchupId !== String(userCurrentMatchup?.id)
                    }
                    onMatchupChange={(matchupId) => {
                      setSelectedMatchupId(matchupId);
                      // Update URL with matchup ID as route parameter for shareable links
                      navigate(
                        `/baseball/league/${leagueId}/matchup/${matchupId}`,
                        {
                          replace: true,
                        },
                      );
                    }}
                    onResetToDefault={() => {
                      const targetId = userCurrentMatchup?.id;
                      if (targetId) {
                        setSelectedMatchupId(targetId);
                        navigate(
                          `/baseball/league/${leagueId}/matchup/${targetId}`,
                          { replace: true },
                        );
                      } else {
                        setSelectedMatchupId(null);
                        navigate(`/baseball/league/${leagueId}/matchup`, {
                          replace: true,
                        });
                      }
                    }}
                  />
                  <MatchupScoreboard
                    matchup={displayedMatchup}
                    gamesRemaining={
                      (displayedMatchup.gamesPerMatchup ?? 0) -
                      (displayedMatchup.selectedGamesCount ?? 0)
                    }
                    onTeamClick={handleViewTeamRoster}
                  />
                  {displayedMatchup.gamesPerMatchup && (
                    <GamesRemaining
                      gamesRemaining={
                        (displayedMatchup.gamesPerMatchup ?? 0) -
                        (displayedMatchup.selectedGamesCount ?? 0)
                      }
                      totalGames={displayedMatchup.gamesPerMatchup}
                    />
                  )}
                  <MatchupRosterComparison matchup={displayedMatchup} />
                  {(displayedMatchup.startTime || displayedMatchup.endTime) && (
                    <Card
                      backgroundColor="$surfacePanel"
                      borderColor="$surfacePanelBorder"
                      borderWidth={1}
                      padding="$4"
                      borderRadius="$6"
                    >
                      <YStack gap="$2">
                        <Text fontSize="$3" fontWeight="700" color="$color">
                          Schedule
                        </Text>
                        <YStack gap="$1">
                          {displayedMatchup.startTime && (
                            <Text fontSize="$2" color="$textMuted">
                              Start:{' '}
                              {new Date(
                                String(displayedMatchup.startTime),
                              ).toLocaleString()}
                            </Text>
                          )}
                          {displayedMatchup.endTime && (
                            <Text fontSize="$2" color="$textMuted">
                              End:{' '}
                              {new Date(
                                String(displayedMatchup.endTime),
                              ).toLocaleString()}
                            </Text>
                          )}
                        </YStack>
                      </YStack>
                    </Card>
                  )}
                </YStack>
              ) : (
                <YStack gap="$4">
                  {/* Navigation — shown even when no matchup is currently active,
                      so users can browse past and future weeks */}
                  {allLeagueMatchups.length > 0 && (
                    <MatchupNavigationControls
                      currentMatchup={undefined}
                      currentLeagueWeek={currentWeek ?? undefined}
                      leagueId={leagueId}
                      allMatchups={allLeagueMatchups}
                      userTeamId={reduxUserTeamId}
                      isViewingOther={false}
                      onMatchupChange={(matchupId) => {
                        setSelectedMatchupId(matchupId);
                        navigate(
                          `/baseball/league/${leagueId}/matchup/${matchupId}`,
                          { replace: true },
                        );
                      }}
                    />
                  )}
                  <Card
                    backgroundColor="$surfacePanel"
                    borderColor="$surfacePanelBorder"
                    borderWidth={1}
                    padding="$6"
                    borderRadius="$6"
                    alignItems="center"
                  >
                    <YStack alignItems="center" gap="$3">
                      <Swords size={32} color="var(--textMuted)" />
                      {allLeagueMatchups.length > 0 ? (
                        <>
                          <Text
                            color="$textMuted"
                            fontSize="$5"
                            fontWeight="600"
                          >
                            No Active Matchup
                          </Text>
                          <Text
                            color="$textMuted"
                            fontSize="$3"
                            textAlign="center"
                            maxWidth={400}
                          >
                            Use the navigation above to browse past or upcoming
                            matchups.
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text
                            color="$textMuted"
                            fontSize="$5"
                            fontWeight="600"
                          >
                            No Active Matchup
                          </Text>
                          <Text
                            color="$textMuted"
                            fontSize="$3"
                            textAlign="center"
                            maxWidth={400}
                          >
                            {isCommissioner
                              ? 'Head to the Commissioner tab to start the draft and create matchups.'
                              : "The commissioner hasn't created matchups yet. Check back soon!"}
                          </Text>
                          {isCommissioner && (
                            <Button
                              marginTop="$2"
                              backgroundColor={BRAND_NAVY_LIGHT}
                              color="white"
                              borderRadius="$4"
                              onPress={() => changeTab('commissioner')}
                            >
                              <Text fontWeight="600" color="white">
                                Go to Commissioner
                              </Text>
                            </Button>
                          )}
                        </>
                      )}
                    </YStack>
                  </Card>
                </YStack>
              )}
            </YStack>
          )}
          {activeTab === 'trades' && (
            <YStack
              role="tabpanel"
              id="panel-trades"
              aria-labelledby="tab-trades"
            >
              {!userTeamId && (
                <Card
                  backgroundColor="$surfacePanel"
                  borderColor="$surfacePanelBorder"
                  borderWidth={1}
                  borderRadius="$6"
                  padding="$8"
                  alignItems="center"
                >
                  <YStack alignItems="center" gap="$3">
                    <ArrowLeftRight size={32} color="var(--textMuted)" />
                    <Text color="$textMuted" fontSize="$5" fontWeight="600">
                      Trades
                    </Text>
                    <Text color="$textMuted" fontSize="$3" textAlign="center">
                      Join this league to view and submit trade offers.
                    </Text>
                  </YStack>
                </Card>
              )}
              {userTeamId && (
                <TradingCenter
                  leagueId={leagueId}
                  userTeamId={userTeamId}
                  isCommissioner={isCommissioner}
                />
              )}
            </YStack>
          )}
          {activeTab === 'team-settings' && renderTeamSettings()}
          {activeTab === 'commissioner' &&
            isCommissioner &&
            renderCommissionerSettings()}
        </ContentArea>
      </PageContainer>
    </LeagueWebSocketContext.Provider>
  );
}

export default LeagueDetailPage;
