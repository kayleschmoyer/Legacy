import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Check,
  ChevronLeft,
  ClipboardList,
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
import { ClientNotificationType } from '@legacy-sports/utils/notification-types';
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
  LeagueFragment,
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsLazyQuery,
  useGetMatchupPlayersQuery,
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
import { LeagueChatTab } from '../../features/baseball/LeagueChatTab';
import { CommissionerAnnouncementsPanel } from '../../features/baseball/CommissionerAnnouncementsPanel';
import { LeagueFreeAgents } from '../../features/baseball/LeagueFreeAgents';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';
import { NextStepControl } from '../../features/commissioner/NextStepControl';
import { AvatarPicker } from '../../components/common';
import { DraftSettingsControl } from '../../components/commissioner/DraftSettingsControl';
import { LeagueSettingsControl } from '../../components/commissioner/LeagueSettingsControl';
import { AchievementRestrictionsControl } from '../../components/commissioner/AchievementRestrictionsControl';
import { WaiverProcessControl } from '../../features/commissioner/WaiverProcessControl';
import { DeleteLeagueControl } from '../../features/commissioner/DeleteLeagueControl';
import {
  useCurrentMatchup,
  useMatchupById,
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

const QuickStatCard = styled(YStack, {
  flex: 1,
  minWidth: 140,
  backgroundColor: '$surfaceCard',
  borderColor: '$surfacePanelBorder',
  borderWidth: 1,
  borderRadius: '$5',
  padding: '$3',
  gap: '$1',
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
  const [showQRCode, setShowQRCode] = useState(false);
  const [renameEditing, setRenameEditing] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameSuccess, setRenameSuccess] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // ── Viewing Other Team State ──
  /** When set, the roster tab shows another team's roster in read-only mode */
  const [viewingTeamId, setViewingTeamId] = useState<number | null>(null);

  const { user } = useAuth();

  // Ref to hold refetchCurrentMatchup so WebSocket callbacks can call it
  // without creating a hook-ordering dependency
  const refetchCurrentMatchupRef = useRef<
    (() => void | Promise<unknown>) | undefined
  >(undefined);

  // Ref to hold refetchTeamMembers so handleDraftCompleted can call it
  // without creating a hook-ordering dependency (query is declared later)
  const refetchTeamMembersRef = useRef<
    (() => void | Promise<unknown>) | undefined
  >(undefined);

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

  const {
    data,
    loading,
    error,
    refetch: refetchLeague,
  } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId },
    notifyOnNetworkStatusChange: true,
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
    useGetUserTeamIdLazyQuery();

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

  // ── WebSocket: listen for draft lifecycle events ──

  const authToken = useMemo(
    () =>
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem('auth_jwt') ?? '')
        : '',
    [],
  );

  const handleDraftCompleted = useCallback(() => {
    void refetchLeague();
    // Clear cached team members so the skip guard lifts and we get fresh data
    dispatch(setTeamMembers([]));
    void refetchTeamMembersRef.current?.();
  }, [refetchLeague, dispatch]);

  const handleDraftStarted = useCallback(() => {
    void refetchLeague();
  }, [refetchLeague]);

  const handleRosterUpdate = useCallback(() => {
    void refetchLeague();
  }, [refetchLeague]);

  const handleMatchupStatsComplete = useCallback(() => {
    void refetchLeague();
    // Also refetch matchup data so statsLoadingStatus updates and spinner clears
    void refetchCurrentMatchupRef.current?.();
  }, [refetchLeague]);

  // Create the single shared WebSocket connection for this league page.
  // All child components (chat, trades, roster) subscribe via
  // LeagueWebSocketContext instead of opening their own connections.
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    const wsUrl = env.websocketUrl;
    console.log('[LeagueDetailPage] WebSocket config', {
      websocketUrl: wsUrl ? `${wsUrl.substring(0, 30)}...` : 'NOT SET',
      hasAuthToken: !!authToken,
      leagueId,
    });
    if (!wsUrl || !authToken || isNaN(leagueId)) return;

    let active = true;
    const client = new WebSocketClient({
      url: wsUrl,
      token: authToken,
      leagueId,
      viewContext: 'league',
      autoConnect: false,
    });
    setWsClient(client);
    client.on('connected', () => {
      if (active) setWsConnected(true);
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
  }, [leagueId, authToken]);

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
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [
    wsClient,
    handleDraftCompleted,
    handleDraftStarted,
    handleRosterUpdate,
    handleMatchupStatsComplete,
  ]);

  useEffect(() => {
    if (wsError) {
      console.error('[LeagueDetailPage] WebSocket error:', wsError);
    }
  }, [wsError]);

  useEffect(() => {
    console.log('[LeagueDetailPage] WebSocket connected:', wsConnected);
  }, [wsConnected]);

  // ── Derived Data ──

  const userTeamId = reduxUserTeamId ?? userTeamData?.userTeamId ?? null;
  const league = reduxLeagueData ?? data?.league;
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
        }));

  const isCommissioner = reduxIsCommissioner || league?.owner === user?.id;

  // Spectator mode: authenticated user viewing a public league they are not a member of
  const isSpectator = !!(
    data?.league?.isPublic && !data?.league?.userMembership
  );

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

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
    profileName: scoringProfileName,
    profile: scoringProfile,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  // Current matchup (for default selection)
  const {
    matchup: currentMatchup,
    loading: currentMatchupLoading,
    error: currentMatchupError,
    refetch: refetchCurrentMatchup,
  } = useCurrentMatchup(!isNaN(leagueId) ? leagueId : null);

  // Keep the ref in sync so WebSocket callbacks can trigger matchup refetch
  refetchCurrentMatchupRef.current = refetchCurrentMatchup;

  // Selected matchup state (null means show current matchup)
  // Initialize from URL route parameter if present
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(
    matchupIdParam ?? null,
  );

  // Fetch all matchups for navigation
  const { matchups: allLeagueMatchups } = useMatchupsForLeague(
    !isNaN(leagueId) ? leagueId : null,
  );

  // Fetch selected matchup if user navigated away from current
  const {
    matchup: selectedMatchup,
    loading: selectedMatchupLoading,
    error: selectedMatchupError,
  } = useMatchupById(
    selectedMatchupId ? parseInt(selectedMatchupId, 10) : null,
  );

  // Determine which matchup to display
  const displayedMatchup = selectedMatchupId ? selectedMatchup : currentMatchup;
  const matchupLoading = selectedMatchupId
    ? selectedMatchupLoading
    : currentMatchupLoading;
  const matchupError = selectedMatchupId
    ? selectedMatchupError
    : currentMatchupError;
  const refetchMatchup = useMemo(
    () =>
      selectedMatchupId
        ? () => {
            void refetchCurrentMatchup();
          }
        : refetchCurrentMatchup,
    [selectedMatchupId, refetchCurrentMatchup],
  );

  // Sync selected matchup ID when URL param changes (e.g., when navigating via shared link)
  useEffect(() => {
    if (matchupIdParam !== selectedMatchupId) {
      setSelectedMatchupId(matchupIdParam ?? null);
    }
  }, [matchupIdParam, selectedMatchupId]);

  // Reset to current matchup when it changes (e.g., week advance)
  useEffect(() => {
    if (currentMatchup?.id && !selectedMatchupId) {
      // We're viewing current matchup and it changed, stay on current
    } else if (currentMatchup?.id && selectedMatchupId === currentMatchup.id) {
      // We were viewing current, and it's still current, stay selected
    }
  }, [currentMatchup?.id, selectedMatchupId]);

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
        // Try season stats projection first
        const seasonStats: SeasonStats = {
          playerId: pid,
          season: mp.season ?? new Date().getFullYear(),
          battingStats: mp.seasonBatting ?? undefined,
          pitchingStats: mp.seasonPitching ?? undefined,
          fieldingStats: mp.seasonFielding ?? undefined,
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
      setMatchupSuccessMessage(message);
      setMatchupErrorMessage(null);
      announcePolite(message);
      void refetchMatchup();
      setTimeout(() => setMatchupSuccessMessage(null), 5000);
    },
    [refetchMatchup],
  );

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
        console.error('Player ID is required');
        return;
      }
      try {
        const result = await updateTeamMemberPosition({
          variables: { teamMemberId: player.id, positionId: position.id },
        });
        const updated = result.data?.updateTeamMemberPosition;
        if (updated) {
          dispatch(updateTeamMember(updated as TeamMemberFragment));
        }
      } catch (error) {
        console.error('Error assigning player:', error);
      }
    },
    [updateTeamMemberPosition, dispatch],
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
          });
          const updated = result.data?.updateTeamMemberPosition;
          if (updated) {
            dispatch(updateTeamMember(updated as TeamMemberFragment));
          }
        }
      } catch (error) {
        console.error('Error removing player:', error);
      }
    },
    [updateTeamMemberPosition, teamMembers, dispatch],
  );

  const handlePlayerSwap = useCallback(
    async (
      incomingPlayer: TeamMemberFragment,
      targetPosition: LeaguePositionFragment,
      displacedPlayer: TeamMemberFragment,
    ) => {
      if (!incomingPlayer.id || !displacedPlayer.id) {
        console.error('Player IDs are required for swap');
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
        });

        const swapped = result.data?.swapTeamMemberPositions;
        if (swapped) {
          for (const member of swapped) {
            dispatch(updateTeamMember(member as TeamMemberFragment));
          }
        }
      } catch (error) {
        console.error('Error swapping players:', error);
      }
    },
    [swapTeamMemberPositions, positions, dispatch],
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
      console.error('Error copying invite code:', error);
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
      console.error('Error copying invite link:', error);
      alert('Failed to copy invite link to clipboard');
    }
  }, [inviteUrl]);

  // ── Computed values ──

  const assignedCount = teamMembers.filter((p) => p?.positionId).length;
  const benchCount = teamMembers.length - assignedCount;
  const teamCount = leagueTeams.length;
  const draftColors = getDraftBadgeColors(String(league?.draftStatus));

  // ── Loading / Error States ──

  if (loading || positionsLoading || teamMembersLoading) {
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

      {/* Quick Stats */}
      <XStack gap="$3" flexWrap="wrap">
        <QuickStatCard>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            Teams
          </Text>
          <Text fontSize="$8" fontWeight="800" color={BRAND_GOLD_LIGHT}>
            {teamCount}
          </Text>
        </QuickStatCard>
        <QuickStatCard>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            Roster Size
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$color">
            {league.maxRosterSize}
          </Text>
        </QuickStatCard>
        <QuickStatCard>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            My Starters
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$green11">
            {assignedCount}
          </Text>
        </QuickStatCard>
        <QuickStatCard>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            On Bench
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$amber11">
            {benchCount}
          </Text>
        </QuickStatCard>
        <QuickStatCard>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            Week
          </Text>
          <Text fontSize="$8" fontWeight="800" color="$color">
            {currentMatchup?.weekNumber || '\u2014'}
          </Text>
        </QuickStatCard>
      </XStack>

      {/* Two-column layout */}
      <XStack gap="$5" flexWrap="wrap" alignItems="flex-start">
        {/* Main column */}
        <YStack flex={2} minWidth={260} gap="$5">
          {/* Matchup Preview */}
          {currentMatchup && !matchupLoading && (
            <Card
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$6"
              padding="$5"
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
                matchup={currentMatchup}
                gamesRemaining={
                  (currentMatchup.gamesPerMatchup ?? 0) -
                  (currentMatchup.selectedGamesCount ?? 0)
                }
                onTeamClick={handleViewTeamRoster}
              />
            </Card>
          )}

          {/* Activity Feed */}
          <LeagueActivityFeed
            leagueId={leagueId}
            draftStatus={String(league.draftStatus)}
            currentMatchup={currentMatchup?.weekNumber}
            teamCount={teamCount}
          />

          {/* Scoring Summary */}
          <LeagueScoringSummary
            loading={scoringLoading}
            error={scoringError}
            profileName={scoringProfileName}
            settings={scoringSettings}
          />
        </YStack>

        {/* Sidebar */}
        <YStack flex={1} minWidth={240} maxWidth={380} gap="$5">
          {/* League Details */}
          <Card
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            borderRadius="$6"
            padding="$5"
          >
            <XStack alignItems="center" gap="$2" marginBottom="$4">
              <Info size={18} color="var(--color)" />
              <Text fontSize="$5" fontWeight="700" color="$color">
                League Details
              </Text>
            </XStack>
            <YStack gap="$3">
              <XStack justifyContent="space-between" alignItems="center">
                <Text color="$textMuted" fontSize="$3">
                  Draft Status
                </Text>
                <DraftBadge
                  backgroundColor={draftColors.bg}
                  borderColor={draftColors.border}
                >
                  <Text fontSize="$2" fontWeight="700" color={draftColors.text}>
                    {formatDraftStatus(String(league.draftStatus))}
                  </Text>
                </DraftBadge>
              </XStack>
              <Separator borderColor="$outlineSubtle" />
              <XStack justifyContent="space-between">
                <Text color="$textMuted" fontSize="$3">
                  Roster Limit
                </Text>
                <Text color="$color" fontWeight="600" fontSize="$3">
                  {league.maxRosterSize} players
                </Text>
              </XStack>
              <Separator borderColor="$outlineSubtle" />
              <XStack justifyContent="space-between">
                <Text color="$textMuted" fontSize="$3">
                  Positions
                </Text>
                <Text color="$color" fontWeight="600" fontSize="$3">
                  {positions.length} slots
                </Text>
              </XStack>
              <Separator borderColor="$outlineSubtle" />
              <XStack justifyContent="space-between">
                <Text color="$textMuted" fontSize="$3">
                  Week
                </Text>
                <Text color="$color" fontWeight="600" fontSize="$3">
                  {currentMatchup?.weekNumber || 'Pre-season'}
                </Text>
              </XStack>
              {isCommissioner && (
                <>
                  <Separator borderColor="$outlineSubtle" />
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text color="$textMuted" fontSize="$3">
                      Role
                    </Text>
                    <XStack
                      backgroundColor="$amber3"
                      borderColor="$amber7"
                      borderWidth={1}
                      borderRadius="$10"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                    >
                      <Text fontSize="$2" fontWeight="700" color="$amber11">
                        Commissioner
                      </Text>
                    </XStack>
                  </XStack>
                </>
              )}
            </YStack>
          </Card>

          {/* Quick Standings */}
          {leagueTeams.length > 0 && (
            <Card
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$6"
              padding="$5"
            >
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
              <YStack gap="$2">
                {leagueTeams.slice(0, 6).map((team, idx) => (
                  <XStack
                    key={team.id}
                    justifyContent="space-between"
                    alignItems="center"
                    paddingVertical="$2"
                    paddingHorizontal="$2"
                    borderRadius="$3"
                    backgroundColor={
                      userTeamId === team.id
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                        : 'transparent'
                    }
                    cursor="pointer"
                    hoverStyle={{
                      backgroundColor:
                        userTeamId === team.id
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.25)
                          : '$surfaceSubtle',
                    }}
                    pressStyle={{ scale: 0.98, opacity: 0.9 }}
                    onPress={() => handleViewTeamRoster(team.id)}
                    animation="quick"
                  >
                    <XStack alignItems="center" gap="$2">
                      <Text
                        fontSize="$3"
                        fontWeight="700"
                        color="$textMuted"
                        width={20}
                      >
                        {idx + 1}
                      </Text>
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
                  <Text
                    fontSize="$2"
                    color="$textMuted"
                    textAlign="center"
                    marginTop="$1"
                  >
                    +{leagueTeams.length - 6} more teams
                  </Text>
                )}
              </YStack>
            </Card>
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

      {/* League Chat */}
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        overflow="hidden"
      >
        <XStack alignItems="center" gap="$2" padding="$5" paddingBottom="$3">
          <MessageSquare size={18} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$5" fontWeight="700" color="$color">
            League Chat
          </Text>
        </XStack>
        <YStack height={420}>
          <LeagueChatTab
            leagueId={leagueId}
            userId={user?.id ?? 0}
            onNavigate={(tabId) => setActiveTab(tabId as TabId)}
          />
        </YStack>
      </Card>
    </YStack>
  );

  const renderRosterManagement = () => {
    const isViewingOther = viewingTeamId !== null && !isViewingOwnTeam;

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

        {!isViewingOther && userTeamId && (
          <PendingWaiverClaims teamId={userTeamId} />
        )}

        {!isViewingOther && userTeamId && (
          <PendingTradeOffers teamId={userTeamId} leagueId={leagueId} />
        )}

        <LeagueRosterManagement
          positions={positions}
          teamPlayers={isViewingOther ? viewingTeamMembers : teamMembers}
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
              : positionsLoading || teamMembersLoading || userTeamLoading
          }
          playerMatchupData={playerMatchupDataMap}
          readOnly={isViewingOther}
          teamName={isViewingOther ? viewingTeamName : undefined}
          minCareerGames={league.minCareerGames ?? 50}
          minCareerSeasons={league.minCareerSeasons ?? 3}
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
                      /^#[0-9a-fA-F]{6}$/.test(teamPrimaryColor)
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
                    onChangeText={setTeamPrimaryColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                  />
                </XStack>
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
                      /^#[0-9a-fA-F]{6}$/.test(teamSecondaryColor)
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
                    onChangeText={setTeamSecondaryColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                  />
                </XStack>
              </YStack>
            </XStack>
            <Button
              size="$3"
              backgroundColor={BRAND_NAVY_LIGHT}
              color={WHITE}
              borderRadius="$3"
              alignSelf="flex-start"
              disabled={teamBrandingLoading}
              opacity={teamBrandingLoading ? 0.6 : 1}
              onPress={() => {
                if (!userTeamId) return;
                void updateTeamBranding({
                  variables: {
                    teamId: userTeamId,
                    leagueId,
                    primaryColor: teamPrimaryColor || null,
                    secondaryColor: teamSecondaryColor || null,
                  },
                });
              }}
            >
              {teamBrandingLoading ? 'Saving…' : 'Save Colors'}
            </Button>
          </YStack>
        </Card>
      </YStack>
    );
  };

  const renderCommissionerSettings = () => (
    <YStack
      gap="$4"
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

      {matchupLoading ? (
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
          currentMatchup={currentMatchup}
          gamesPerMatchup={currentMatchup?.gamesPerMatchup ?? 1}
          draftStatus={league.draftStatus}
          onSuccess={handleMatchupSuccess}
          onError={handleMatchupError}
          onLeagueUpdate={handleLeagueUpdate}
        />
      )}

      <DraftSettingsControl
        leagueId={leagueId}
        draftStatus={league.draftStatus}
        playerPool={league.playerPool}
        onSuccess={(message) => {
          setMatchupSuccessMessage(message);
          setTimeout(() => setMatchupSuccessMessage(null), 5000);
        }}
        onError={(err) => {
          setMatchupErrorMessage(err.message);
        }}
      />

      <LeagueSettingsControl
        leagueId={leagueId}
        currentGamesPerMatchup={league.gamesPerMatchup ?? 5}
        currentSpStartsPerMatchup={league.spStartsPerMatchup ?? 1}
        currentMinCareerGames={league.minCareerGames ?? 50}
        currentMinCareerSeasons={league.minCareerSeasons ?? 3}
        currentTotalMatchups={league.totalMatchups ?? 10}
        currentPlayoffEnabled={league.playoffEnabled ?? true}
        currentPlayoffFormat={league.playoffFormat ?? '4-team'}
        currentPlayoffMultiWeek={league.playoffMultiWeek ?? false}
        onSuccess={(message) => {
          setMatchupSuccessMessage(message);
          setTimeout(() => setMatchupSuccessMessage(null), 5000);
        }}
        onError={(err) => {
          setMatchupErrorMessage(err.message);
        }}
      />

      <AchievementRestrictionsControl
        leagueId={leagueId}
        onSuccess={(message) => {
          setMatchupSuccessMessage(message);
          setTimeout(() => setMatchupSuccessMessage(null), 5000);
        }}
        onError={(err) => {
          setMatchupErrorMessage(err.message);
        }}
      />

      <WaiverProcessControl
        leagueId={leagueId}
        onSuccess={(message) => {
          setMatchupSuccessMessage(message);
          setTimeout(() => setMatchupSuccessMessage(null), 5000);
        }}
        onError={(err) => {
          setMatchupErrorMessage(err.message);
        }}
      />

      <LeagueScoringEditor
        leagueId={leagueId}
        profile={scoringProfile}
        loading={scoringLoading}
        error={scoringError}
        onRefetch={async () => {
          await refetchScoringProfile({ leagueId });
        }}
      />

      <DeleteLeagueControl
        leagueId={leagueId}
        leagueName={league.name ?? 'Unknown League'}
        onSuccess={() => {
          // Handled by DeleteLeagueControl
        }}
        onError={(deleteError) => {
          console.error('Delete league error:', deleteError);
          alert(`Error deleting league: ${deleteError.message}`);
        }}
      />
    </YStack>
  );

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
                  backgroundColor={draftColors.bg}
                  borderColor={draftColors.border}
                >
                  <Text fontSize="$2" fontWeight="700" color={draftColors.text}>
                    {formatDraftStatus(String(league.draftStatus))}
                  </Text>
                </DraftBadge>
                {currentMatchup?.weekNumber && (
                  <>
                    <Text fontSize="$3" color={withAlpha(WHITE, 0.45)}>
                      |
                    </Text>
                    <Text fontSize="$3" color={withAlpha(WHITE, 0.75)}>
                      Week {currentMatchup.weekNumber}
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
              onPress={handleCopyInviteLink}
              icon={
                inviteLinkCopied ? (
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
                color={inviteLinkCopied ? '$green11' : BRAND_GOLD_LIGHT}
              >
                {inviteLinkCopied ? 'Copied!' : 'Invite'}
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
                onPress={() => {
                  if (tab.id === 'roster') {
                    // Clicking the roster tab resets to viewing own roster
                    setViewingTeamId(null);
                  }
                  changeTab(tab.id);
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
                gamesPerMatchup={currentMatchup?.gamesPerMatchup ?? 5}
              />
            </YStack>
          )}
          {activeTab === 'standings' && (
            <YStack
              role="tabpanel"
              id="panel-standings"
              aria-labelledby="tab-standings"
            >
              <LeagueStandings
                leagueId={leagueId}
                teams={leagueTeams}
                loading={leagueTeamsLoading}
                userTeamId={userTeamId}
                waiverType={league?.waiverType}
                onTeamClick={handleViewTeamRoster}
              />
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
                    leagueId={leagueId}
                    allMatchups={allLeagueMatchups}
                    userTeamId={reduxUserTeamId}
                    isViewingOther={selectedMatchupId != null}
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
                      setSelectedMatchupId(null);
                      // Navigate back to base matchup tab without matchupId
                      navigate(`/baseball/league/${leagueId}/matchup`, {
                        replace: true,
                      });
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
                    <Text color="$textMuted" fontSize="$5" fontWeight="600">
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
                  </YStack>
                </Card>
              )}
            </YStack>
          )}
          {activeTab === 'trades' && userTeamId && (
            <TradingCenter
              leagueId={leagueId}
              userTeamId={userTeamId}
              isCommissioner={isCommissioner}
            />
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
