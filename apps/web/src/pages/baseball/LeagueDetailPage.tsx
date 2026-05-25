import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
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
  Crown,
  Edit3,
  Eye,
  Info,
  LayoutGrid,
  Link2,
  MessageSquare,
  QrCode,
  Settings,
  Share2,
  Shield,
  Swords,
  Trophy,
  UserPlus,
  X,
  Zap,
} from '@tamagui/lucide-icons';
import { QRCodeSVG } from 'qrcode.react';
import { ClientNotificationType } from '@legacy-sports/utils';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import {
  AwardVotingPanel,
  LeagueScoringSummary,
} from '@legacy-sports/shared-components/leagues';
import { MatchupNavigationControls } from '@legacy-sports/shared-components/matchup';
import {
  PendingTradeOffers,
  PendingWaiverClaims,
} from '@legacy-sports/shared-components/roster';
import { SeasonAwardsControl } from '@legacy-sports/shared-components/commissioner';
import {
  handleRosterMutationError,
  MATCHUP_LOCK_POLL_INTERVAL_MS,
} from './matchup-lock-refresh';
import { PageMeta } from '../../components/PageMeta';
import { LeagueActivityFeed } from '../../features/baseball/LeagueActivityFeed';
import { LeagueHistory } from '../../features/baseball/LeagueHistory';
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
  useSetNicknameMutation,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamBrandingMutation,
  useUpdateTeamMemberPositionMutation,
} from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  GRAY,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { LeagueRosterManagement } from '../../features/roster/LeagueRosterManagement';
import { canPlayerPlayPosition } from '../../features/roster/LeagueRosterManagement';
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
import { NextStepControl } from '../../features/commissioner';
import { AvatarImage, AvatarPicker } from '../../components/common';
import { DraftSettingsControl } from '../../components/commissioner/DraftSettingsControl';
import { LeagueSettingsControl } from '../../components/commissioner/LeagueSettingsControl';
import { LeagueBrandingControl } from '../../components/commissioner/LeagueBrandingControl';
import { AchievementRestrictionsControl } from '../../components/commissioner/AchievementRestrictionsControl';
import { TiebreakerConfig } from '../../components/league/TiebreakerConfig';
import { LeagueDuesControl } from '../../components/commissioner/LeagueDuesControl';
import { LeagueDuesStatusDashboard } from '../../components/commissioner/LeagueDuesStatusDashboard';
import {
  SeasonRenewalControl,
  WaiverProcessControl,
} from '../../features/commissioner';
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
import { announcePolite } from '../../utils/a11y';
import { useLeagueWebSocketLifecycle } from '../../hooks/useLeagueWebSocketLifecycle';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  resetLeagueState,
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

/** Editorial typography: Big Shoulders Display for headings & stat values (see AGENTS.md § Design Context) */
const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const DraftOrderControl = React.lazy(() =>
  import('../../components/commissioner/DraftOrderControl').then((m) => ({
    default: m.DraftOrderControl,
  })),
);

// ── Matchup Scoring Data (shared with roster component) ─────────────────────

export interface PlayerMatchupData {
  /** Actual score from games already played (null when no game data is available) */
  score: number | null;
  /** Projected total score (actual + projected remaining, null when unavailable) */
  projection: number | null;
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
  backgroundColor: '$background',
  paddingBottom: '$8',
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

const SnapshotBar = styled(XStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  backgroundColor: '$surfacePanel',
  paddingVertical: '$5',
  paddingHorizontal: '$6',
  gap: '$5',
  alignItems: 'center',
  justifyContent: 'space-around',
  flexWrap: 'wrap',
  $sm: {
    paddingHorizontal: '$3',
    paddingVertical: '$4',
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
  height: 44,
  backgroundColor: '$outlineSubtle',
  opacity: 0.5,
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

const CommissionerSectionHeader = styled(YStack, {
  backgroundColor: '$surfacePanel',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$glassBorder',
});

const CommissionerSectionToggle = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  color: '$color',
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

// ── DraftStatusChip ──────────────────────────────────────────────────────────

type DraftChipDef = {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot?: string;
};

const DRAFT_CHIP_MAP: Record<string, DraftChipDef> = {
  'not-started': {
    label: 'Pre-Draft',
    color: BRAND_GOLD_LIGHT,
    bg: withAlpha(BRAND_GOLD_LIGHT, 0.14),
    border: withAlpha(BRAND_GOLD_LIGHT, 0.4),
  },
  queued: {
    label: 'Draft Queued',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.4)',
  },
  'in-progress': {
    label: 'Drafting · Live',
    color: BRAND_GOLD_LIGHT,
    bg: BRAND_NAVY,
    border: withAlpha(BRAND_GOLD_LIGHT, 0.45),
    dot: '#E63950',
  },
  completed: {
    label: 'Season Active',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.4)',
    dot: '#22C55E',
  },
};

function DraftStatusChip({
  status,
}: {
  status?: string | null;
}): React.JSX.Element | null {
  if (!status) return null;
  const chip: DraftChipDef = DRAFT_CHIP_MAP[status] ?? {
    label: formatDraftStatus(status),
    color: withAlpha(WHITE, 0.55),
    bg: withAlpha(WHITE, 0.05),
    border: withAlpha(WHITE, 0.15),
  };
  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      alignSelf="flex-start"
      style={{
        background: chip.bg,
        border: `1px solid ${chip.border}`,
        borderRadius: 9999,
        padding: '5px 10px',
      }}
    >
      {chip.dot && (
        <YStack
          width={7}
          height={7}
          borderRadius={9999}
          style={{ background: chip.dot, flexShrink: 0 }}
        />
      )}
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          color: chip.color,
        }}
      >
        {chip.label}
      </Text>
    </XStack>
  );
}

// ── Tab Definitions ──────────────────────────────────────────────────────────

type TabId =
  | 'overview'
  | 'roster'
  | 'free-agents'
  | 'standings'
  | 'history'
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

// Overview is the league's primary entry point and sits furthest left;
// weekly/in-season tabs follow, with archival and settings tabs at the end.
const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
  { id: 'matchup', label: 'Matchup', icon: <Swords size={16} /> },
  { id: 'roster', label: 'My Roster', icon: <ClipboardList size={16} /> },
  { id: 'free-agents', label: 'Free Agents', icon: <UserPlus size={16} /> },
  { id: 'standings', label: 'Standings', icon: <Trophy size={16} /> },
  { id: 'trades', label: 'Trades', icon: <ArrowLeftRight size={16} /> },
  { id: 'history', label: 'History', icon: <Clock size={16} /> },
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
  history: 'history',
  matchup: 'matchup',
  trades: 'trades',
  'my-team': 'team-settings',
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
  const leagueId = /^\d+$/.test(id ?? '') ? parseInt(id ?? '', 10) : NaN;
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

  const getTabFromUrl = useCallback((): TabId | null => {
    if (!tabParam) return 'overview';
    if (Object.prototype.hasOwnProperty.call(TAB_ALIASES, tabParam)) {
      return TAB_ALIASES[tabParam];
    }
    // Unknown tab segment — signal to the redirect effect below
    return null;
  }, [tabParam]);

  const [activeTab, setActiveTab] = useState<TabId>(
    getTabFromUrl() ?? 'overview',
  );
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

  const { user, token: authToken } = useAuth();

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
    } else {
      // LS-1302: invalid (non-numeric) league ID — clear any previously loaded
      // league from Redux so we don't render a stale league under the invalid URL.
      dispatch(resetLeagueState());
    }
  }, [leagueId, dispatch]);

  useEffect(() => {
    const tabFromUrl = getTabFromUrl();
    if (tabFromUrl === null) {
      // LS-1304: unknown tab URL — replace history entry so pressing Back
      // doesn't loop back to the invalid route.
      navigate(`/baseball/league/${leagueId}/overview`, { replace: true });
      return;
    }
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [getTabFromUrl, activeTab, navigate, leagueId]);

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
    startPolling: startLeaguePolling,
    stopPolling: stopLeaguePolling,
  } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId),
    variables: { id: leagueId },
  });

  useEffect(() => {
    if (data?.league) {
      dispatch(setLeagueData(data.league));
      dispatch(
        setIsCommissioner(
          data.league.owner === user?.id || user?.accessLevel === 'admin',
        ),
      );
    }
  }, [data, dispatch, user?.id, user?.accessLevel]);

  const {
    data: positionsData,
    loading: positionsLoading,
    error: positionsError,
  } = useGetPositionsForLeagueQuery({
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
    {
      data: leagueTeamsData,
      loading: leagueTeamsLoading,
      error: leagueTeamsError,
    },
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
    // Refetch matchups — the server creates all matchups during draft completion,
    // so the commissioner tab's NextStepControl needs fresh data to transition
    // from "Start Draft" to the game-selection / week-advance controls.
    void refetchMatchupsRef.current?.();
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
  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({ leagueId, isAuthenticated, authToken });

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

  // Polling fallback: when the WebSocket is not connected and a draft is active,
  // poll every 30 s so the page picks up DRAFT_COMPLETED even if the WS auth
  // cookie was not sent to the ws. subdomain (LS-2303).
  useEffect(() => {
    if (
      !wsConnected &&
      (draftStatus === 'in-progress' || draftStatus === 'queued')
    ) {
      startLeaguePolling(30_000);
    } else {
      stopLeaguePolling();
    }

    return () => {
      stopLeaguePolling();
    };
  }, [wsConnected, draftStatus, startLeaguePolling, stopLeaguePolling]);

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
      // Also refetch matchups and current week so the catch-up path is
      // consistent with the WebSocket DRAFT_COMPLETED handler — matchups
      // are created during draft completion and the commissioner tab needs
      // fresh data to transition from "Start Draft" to week-advance controls.
      void refetchMatchupsRef.current?.();
      void refetchCurrentWeekRef.current?.();
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

  const isCommissioner =
    reduxIsCommissioner ||
    league?.owner === user?.id ||
    user?.accessLevel === 'admin';

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

  // LS-1057 / LS-1303: Once league data has loaded and commissioner status is known,
  // redirect any non-commissioner who navigated directly to the commissioner
  // tab back to the overview tab. Use replace:true so pressing Back doesn't
  // re-trigger the redirect and create an infinite back-button loop.
  useEffect(() => {
    if (league && activeTab === 'commissioner' && !isCommissioner) {
      navigate(`/baseball/league/${leagueId}/overview`, { replace: true });
    }
  }, [league, activeTab, isCommissioner, navigate, leagueId]);

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
      // Refresh the user's team ID so member-specific tabs (Roster, Trades,
      // My Team) become active without requiring a full page reload.
      void getUserTeamId({ variables: { leagueId } });
      setTimeout(() => navigate(`/baseball/league/${leagueId}/overview`), 1200);
    } catch (err) {
      setSpectatorJoinError((err as Error).message || 'Failed to join league');
    }
  }, [
    spectatorTeamName,
    joinPublicLeague,
    leagueId,
    refetchLeague,
    navigate,
    getUserTeamId,
  ]);

  const {
    data: teamMembersData,
    loading: teamMembersLoading,
    error: teamMembersError,
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
  const [setNickname] = useSetNicknameMutation();

  const [renameTeamMutation, { loading: renaming }] = useRenameTeamMutation();
  const [updateTeamBranding, { loading: teamBrandingLoading }] =
    useUpdateTeamBrandingMutation();
  const [teamPrimaryColor, setTeamPrimaryColor] = useState('');
  const [teamSecondaryColor, setTeamSecondaryColor] = useState('');
  const [teamColorSuccess, setTeamColorSuccess] = useState(false);
  const [teamColorError, setTeamColorError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  const { data: matchupPlayersData, refetch: refetchMatchupPlayers } =
    useGetMatchupPlayersQuery({
      variables: { matchupId: displayedMatchupIdNum ?? 0 },
      skip: !displayedMatchupIdNum,
      fetchPolicy: 'cache-and-network',
      // LS-4034: keep matchup-lock state fresh so the UI doesn't let users
      // move players after the server has locked their matchup mid-session.
      pollInterval: MATCHUP_LOCK_POLL_INTERVAL_MS,
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
      // Use player-specific numberOfGames (SP gets pitcherStartsPerMatchup, others get gamesPerMatchup)
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
        score: gamesPlayed > 0 ? Math.round(actualScore * 10) / 10 : null,
        projection:
          gamesPlayed > 0 || projection !== actualScore
            ? Math.round(projection * 10) / 10
            : null,
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
        handleRosterMutationError({
          error,
          logger: LOGGER,
          logPrefix: 'Error assigning player:',
          refetchMatchupPlayers: displayedMatchupIdNum
            ? refetchMatchupPlayers
            : null,
        });
      }
    },
    [
      updateTeamMemberPosition,
      dispatch,
      displayedMatchupIdNum,
      refetchMatchupPlayers,
    ],
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
        handleRosterMutationError({
          error,
          logger: LOGGER,
          logPrefix: 'Error removing player:',
          refetchMatchupPlayers: displayedMatchupIdNum
            ? refetchMatchupPlayers
            : null,
        });
      }
    },
    [
      updateTeamMemberPosition,
      teamMembers,
      dispatch,
      displayedMatchupIdNum,
      refetchMatchupPlayers,
    ],
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
        handleRosterMutationError({
          error,
          logger: LOGGER,
          logPrefix: 'Error swapping players:',
          refetchMatchupPlayers: displayedMatchupIdNum
            ? refetchMatchupPlayers
            : null,
        });
      }
    },
    [
      swapTeamMemberPositions,
      positions,
      dispatch,
      displayedMatchupIdNum,
      refetchMatchupPlayers,
    ],
  );

  const handleSetNickname = useCallback(
    async (teamMemberId: number, nickname: string | null) => {
      try {
        await setNickname({
          variables: { teamMemberId, nickname },
        });
      } catch (error) {
        LOGGER.error('Error setting nickname:', String(error));
      }
    },
    [setNickname],
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
      gap="$6"
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
                <Text
                  fontSize="$6"
                  fontWeight="800"
                  color={BRAND_GOLD_LIGHT}
                  fontFamily={FONT_DISPLAY}
                  textTransform="uppercase"
                  letterSpacing={0.6}
                >
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

      {/* Award Voting (LS-3126) — shown when voting is open */}
      <AwardVotingPanel
        leagueId={leagueId}
        season={new Date().getFullYear()}
        onSuccess={showMatchupSuccess}
        onError={(err) => {
          setMatchupErrorMessage(err.message);
        }}
      />

      {/* Current Matchup — hero focal point above the fold (LS-3630) */}
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
            background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.12)} 0%, transparent 100%)`,
          }}
        >
          <XStack
            justifyContent="space-between"
            alignItems="center"
            marginBottom="$3"
          >
            <XStack alignItems="center" gap="$2.5">
              <Swords size={18} color={BRAND_GOLD_LIGHT} />
              <Text
                fontSize="$5"
                fontWeight="700"
                color="$color"
                fontFamily={FONT_DISPLAY}
                textTransform="uppercase"
                letterSpacing={0.8}
              >
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
              <Text
                fontSize="$2"
                fontWeight="600"
                color={BRAND_GOLD_LIGHT}
                fontFamily={FONT_DISPLAY}
                textTransform="uppercase"
                letterSpacing={0.6}
              >
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
            letterSpacing={1.2}
            fontWeight="600"
          >
            Teams
          </Text>
          <Text
            fontSize="$9"
            fontWeight="800"
            color={BRAND_GOLD_LIGHT}
            fontFamily={FONT_DISPLAY}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {leagueTeamsLoading ||
            (teamCount === 0 && leagueTeamsData?.leagueTeams === undefined)
              ? '\u2014'
              : teamCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1.2}
            fontWeight="600"
          >
            Roster Size
          </Text>
          <Text
            fontSize="$9"
            fontWeight="800"
            color="$color"
            fontFamily={FONT_DISPLAY}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {league.maxRosterSize}
          </Text>
        </SnapshotStat>
        {league.gamesPerMatchup != null && (
          <>
            <SnapshotDivider />
            <SnapshotStat>
              <Text
                fontSize="$2"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={1.2}
                fontWeight="600"
              >
                Games / Matchup
              </Text>
              <Text
                fontSize="$9"
                fontWeight="800"
                color="$color"
                fontFamily={FONT_DISPLAY}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {league.gamesPerMatchup}
              </Text>
            </SnapshotStat>
          </>
        )}
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1.2}
            fontWeight="600"
          >
            My Starters
          </Text>
          <Text
            fontSize="$9"
            fontWeight="800"
            color="$green11"
            fontFamily={FONT_DISPLAY}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {teamMembersLoading ||
            positionsLoading ||
            (!userTeamId && assignedCount === 0)
              ? '\u2014'
              : assignedCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1.2}
            fontWeight="600"
          >
            On Bench
          </Text>
          <Text
            fontSize="$9"
            fontWeight="800"
            color="$amber11"
            fontFamily={FONT_DISPLAY}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {teamMembersLoading ||
            positionsLoading ||
            (!userTeamId && benchCount === 0)
              ? '\u2014'
              : benchCount}
          </Text>
        </SnapshotStat>
        <SnapshotDivider />
        <SnapshotStat>
          <Text
            fontSize="$2"
            color="$textMuted"
            textTransform="uppercase"
            letterSpacing={1.2}
            fontWeight="600"
          >
            Positions
          </Text>
          <Text
            fontSize="$9"
            fontWeight="800"
            color="$color"
            fontFamily={FONT_DISPLAY}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {positionsLoading && positions.length === 0
              ? '\u2014'
              : positions.length}
          </Text>
        </SnapshotStat>
      </SnapshotBar>

      {/* Two-column dashboard layout */}
      <XStack gap="$5" flexWrap="wrap" alignItems="flex-start">
        {/* Main column */}
        <YStack flex={2} minWidth={260} gap="$5">
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
                      fontSize="$2"
                      fontWeight={isActive ? '700' : '600'}
                      color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                      fontFamily={FONT_DISPLAY}
                      textTransform="uppercase"
                      letterSpacing={1}
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
          {/* Commissioner badge — only render for commissioners, since season /
              week chips are already in the hero header. LS-3630 removed the
              duplicate "League Status" panel for non-commissioners. */}
          {isCommissioner && (
            <SidebarCard>
              <XStack alignItems="center" gap="$2.5" marginBottom="$3">
                <Info size={18} color={BRAND_GOLD_LIGHT} />
                <Text
                  fontSize="$5"
                  fontWeight="700"
                  color="$color"
                  fontFamily={FONT_DISPLAY}
                  textTransform="uppercase"
                  letterSpacing={0.8}
                >
                  Your Role
                </Text>
              </XStack>
              <XStack
                backgroundColor="$amber3"
                borderColor="$amber7"
                borderWidth={1}
                borderRadius="$10"
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                alignSelf="flex-start"
              >
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color="$amber11"
                  fontFamily={FONT_DISPLAY}
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Commissioner
                </Text>
              </XStack>
            </SidebarCard>
          )}

          {/* Quick Standings */}
          {leagueTeams.length > 0 && (
            <SidebarCard data-testid="league-teams">
              <XStack
                justifyContent="space-between"
                alignItems="center"
                marginBottom="$3"
              >
                <XStack alignItems="center" gap="$2.5">
                  <Trophy size={18} color={BRAND_GOLD_LIGHT} />
                  <Text
                    fontSize="$5"
                    fontWeight="700"
                    color="$color"
                    fontFamily={FONT_DISPLAY}
                    textTransform="uppercase"
                    letterSpacing={0.8}
                  >
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
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color={BRAND_GOLD_LIGHT}
                    fontFamily={FONT_DISPLAY}
                    textTransform="uppercase"
                    letterSpacing={0.6}
                  >
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
                        width={26}
                        height={26}
                        borderRadius={13}
                        backgroundColor="$surfaceSubtle"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text
                          fontSize="$3"
                          fontWeight="700"
                          color="$textMuted"
                          fontFamily={FONT_DISPLAY}
                        >
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
                          fontFamily={FONT_DISPLAY}
                          letterSpacing={1}
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

          {/* League Dues Status — visible to all members when dues are enabled */}
          <LeagueDuesStatusDashboard
            leagueId={leagueId}
            isCommissioner={isCommissioner}
            currentUserId={user?.id}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />

          {/* Invite Friends */}
          <InviteCard>
            <XStack alignItems="center" gap="$2.5" marginBottom="$4">
              <UserPlus size={18} color={BRAND_GOLD_LIGHT} />
              <Text
                fontSize="$5"
                fontWeight="700"
                color="$color"
                fontFamily={FONT_DISPLAY}
                textTransform="uppercase"
                letterSpacing={0.8}
              >
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
                  letterSpacing={1}
                  fontFamily={FONT_DISPLAY}
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
                      data-testid="invite-link-url"
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
                  letterSpacing={1}
                  fontFamily={FONT_DISPLAY}
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
                      data-testid="invite-code"
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
                    letterSpacing={1}
                    fontFamily={FONT_DISPLAY}
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
                    <div data-testid="qr-code-svg">
                      <QRCodeSVG
                        value={inviteUrl}
                        size={200}
                        level="M"
                        includeMargin
                      />
                    </div>
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
          error={
            !isViewingOther && !isViewingHistoricalRosterWeek
              ? (positionsError ?? teamMembersError ?? null)
              : null
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
          onSetNickname={
            rosterIsReadOnly
              ? undefined
              : (id, nick) => void handleSetNickname(id, nick)
          }
          leagueId={leagueId}
        />
      </YStack>
    );
  };

  const renderTeamSettings = () => {
    // Non-members (spectators) should not see editable controls.
    // Wait for the userTeamId query to complete before deciding.
    if (!userTeamId) {
      if (userTeamLoading) {
        return (
          <YStack
            gap="$4"
            padding="$4"
            alignItems="center"
            role="tabpanel"
            id="panel-team-settings"
            aria-labelledby="tab-team-settings"
          >
            <Spinner size="large" color={BRAND_NAVY_LIGHT} />
          </YStack>
        );
      }
      return (
        <YStack
          gap="$4"
          padding="$4"
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
            alignItems="center"
          >
            <YStack gap="$3" alignItems="center" maxWidth={400}>
              <Edit3 size={32} color="$textMuted" />
              <Text fontSize="$5" fontWeight="600" color="$textMuted">
                You&apos;re not a member
              </Text>
              <Text fontSize="$3" color="$textMuted" textAlign="center">
                Join this league to manage your team name, logo, and colors.
              </Text>
            </YStack>
          </Card>
        </YStack>
      );
    }

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
                setLogoSuccess(false);
                setLogoError(null);
                updateTeamBranding({
                  variables: { teamId: userTeamId, leagueId, logoUrl: url },
                })
                  .then(() => {
                    if (logoSuccessTimeoutRef.current)
                      clearTimeout(logoSuccessTimeoutRef.current);
                    setLogoSuccess(true);
                    logoSuccessTimeoutRef.current = setTimeout(
                      () => setLogoSuccess(false),
                      4000,
                    );
                  })
                  .catch((err: unknown) => {
                    setLogoError(
                      err instanceof Error
                        ? err.message
                        : 'Failed to save logo',
                    );
                  });
              }}
              loading={teamBrandingLoading}
            />
            {logoSuccess && (
              <XStack alignItems="center" gap="$1">
                <Check size={14} color="var(--green10)" />
                <Text color="$green10" fontSize="$2">
                  Saved
                </Text>
              </XStack>
            )}
            {logoError && (
              <Text color="$red10" fontSize="$2">
                {logoError}
              </Text>
            )}
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
                        <input
                          type="color"
                          aria-label="Pick primary color"
                          value={
                            HEX_RE.test(teamPrimaryColor)
                              ? teamPrimaryColor
                              : GRAY
                          }
                          onChange={(e) => {
                            setTeamPrimaryColor(e.target.value);
                            setTeamColorError(null);
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            padding: 0,
                            border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.5)}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                            flexShrink: 0,
                            backgroundColor: 'transparent',
                          }}
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
                        <input
                          type="color"
                          aria-label="Pick secondary color"
                          value={
                            HEX_RE.test(teamSecondaryColor)
                              ? teamSecondaryColor
                              : GRAY
                          }
                          onChange={(e) => {
                            setTeamSecondaryColor(e.target.value);
                            setTeamColorError(null);
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            padding: 0,
                            border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.5)}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                            flexShrink: 0,
                            backgroundColor: 'transparent',
                          }}
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
            onNavigateToDraftBoard={() =>
              navigate(`/baseball/league/${leagueId}/draft`)
            }
            onNavigateToLeague={(newLeagueId) =>
              navigate(`/baseball/league/${newLeagueId}`)
            }
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
            baseballHofOnly={league.baseballHofOnly}
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
          <Suspense
            fallback={
              <Card padding="$4" backgroundColor="$backgroundStrong">
                <YStack
                  alignItems="center"
                  justifyContent="center"
                  gap="$2"
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="large" />
                  <Text>Loading draft order…</Text>
                </YStack>
              </Card>
            }
          >
            <DraftOrderControl
              leagueId={leagueId}
              draftStatus={league.draftStatus}
              onSuccess={showMatchupSuccess}
              onError={(err) => {
                setMatchupErrorMessage(err.message);
              }}
            />
          </Suspense>
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
            currentSpStartsPerMatchup={league.pitcherStartsPerMatchup ?? 1}
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
        id: 'league-dues',
        title: 'League Dues',
        content: (
          <LeagueDuesControl
            leagueId={leagueId}
            onSuccess={showMatchupSuccess}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
          />
        ),
      },
      {
        id: 'tiebreaker-rules',
        title: 'Tiebreaker Rules',
        content: (
          <TiebreakerConfig
            leagueId={leagueId}
            isCommissioner={isCommissioner}
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
        id: 'season-renewal',
        title: 'New Season',
        content: (
          <SeasonRenewalControl
            leagueId={leagueId}
            leagueName={league.name ?? 'Unknown League'}
            draftStatus={league.draftStatus ?? ''}
            frozenAt={league.frozenAt}
            onSuccess={() => {
              showMatchupSuccess('New season created successfully!');
            }}
            onError={(err) => {
              setMatchupErrorMessage(err.message);
            }}
            onRenewSuccess={(newLeagueId) => {
              navigate(`/baseball/league/${newLeagueId}/overview`);
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
          const buttonId = `commissioner-section-btn-${id}`;
          return (
            <YStack key={id}>
              <CommissionerSectionHeader
                borderBottomLeftRadius={open ? 0 : '$5'}
                borderBottomRightRadius={open ? 0 : '$5'}
                borderBottomWidth={open ? 0 : 1}
              >
                <h4 style={{ margin: 0, padding: 0 }}>
                  <CommissionerSectionToggle
                    tag="button"
                    id={buttonId}
                    type="button"
                    data-testid={`commissioner-section-toggle-${id}`}
                    aria-expanded={open}
                    aria-controls={sectionId}
                    onPress={() => toggleCommissionerSection(id)}
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
                  </CommissionerSectionToggle>
                </h4>
              </CommissionerSectionHeader>
              {open && (
                <YStack
                  id={sectionId}
                  role="region"
                  aria-labelledby={buttonId}
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
                    onChange={(e) => {
                      setSpectatorTeamName(e.target.value);
                      setSpectatorJoinError(null);
                    }}
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

        {/* League Hero Card */}
        <ContentArea paddingTop="$5" paddingBottom="$2">
          <YStack
            gap="$4"
            style={{
              background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.45)} 0%, ${withAlpha(BG_DARK, 0.8)} 100%)`,
              border: `1px solid ${withAlpha(WHITE, 0.08)}`,
              borderRadius: 16,
              padding: '28px 32px',
              overflow: 'hidden',
            }}
          >
            {/* Top row: back link + commissioner badge */}
            <XStack alignItems="center" gap="$3">
              <XStack
                alignItems="center"
                gap="$1"
                cursor="pointer"
                onPress={() => navigate('/baseball')}
                opacity={0.65}
                hoverStyle={{ opacity: 1 }}
                pressStyle={{ opacity: 0.8 }}
                animation="quick"
              >
                <ChevronLeft size={14} color={withAlpha(WHITE, 0.65)} />
                <Text
                  fontSize="$2"
                  color={withAlpha(WHITE, 0.65)}
                  fontWeight="600"
                >
                  Leagues
                </Text>
              </XStack>
              <Text fontSize="$2" color={withAlpha(WHITE, 0.3)}>
                ·
              </Text>
              <Text fontSize="$2" color={withAlpha(WHITE, 0.4)}>
                Baseball
              </Text>
              {isCommissioner && (
                <XStack
                  marginLeft="auto"
                  alignItems="center"
                  gap="$1.5"
                  backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.1)}
                  borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.3)}
                  borderWidth={1}
                  borderRadius="$10"
                  paddingHorizontal="$2.5"
                  paddingVertical="$1"
                >
                  <Crown size={11} color={BRAND_GOLD_LIGHT} />
                  <Text
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                      color: BRAND_GOLD_LIGHT,
                    }}
                  >
                    Commissioner
                  </Text>
                </XStack>
              )}
            </XStack>

            {/* Main row: crest + league info + invite button */}
            <XStack gap="$5" alignItems="flex-start" flexWrap="wrap">
              {/* League crest box */}
              <YStack
                width={92}
                height={92}
                alignItems="center"
                justifyContent="center"
                borderRadius={14}
                borderWidth={1}
                borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.45)}
                style={{
                  background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #0D1E36 100%)`,
                  flexShrink: 0,
                }}
              >
                <Shield size={44} color={BRAND_GOLD_LIGHT} />
              </YStack>

              {/* League name, status chip, meta items */}
              <YStack flex={1} gap="$2.5" minWidth={200}>
                <H1
                  id="league-title"
                  data-testid="league-title"
                  color="white"
                  margin={0}
                  // fontFamily kept in inline style — see LS-3630 for why Tamagui H1 overrides it
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 'clamp(28px, 4vw, 48px)',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    // String bypasses Tamagui's numeric→px conversion (lineHeight: 1.02 → "1.02px").
                    // See .agents/skills/standards/references/tamagui-web-pitfalls.md
                    lineHeight: '1.02' as unknown as number,
                  }}
                >
                  {league.name}
                </H1>

                <DraftStatusChip status={league.draftStatus} />

                {/* Meta items: Week · Teams · Scoring · Invite */}
                <XStack gap="$5" flexWrap="wrap" marginTop="$1">
                  {currentWeek && (
                    <YStack gap="$0.5">
                      <Text
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: 1.4,
                          color: withAlpha(WHITE, 0.45),
                        }}
                      >
                        Week
                      </Text>
                      <Text
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontSize: 20,
                          fontWeight: '700',
                          color: withAlpha(WHITE, 0.9),
                        }}
                      >
                        {currentWeek}
                      </Text>
                    </YStack>
                  )}
                  <YStack gap="$0.5">
                    <Text
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: 10,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: 1.4,
                        color: withAlpha(WHITE, 0.45),
                      }}
                    >
                      Teams
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: 20,
                        fontWeight: '700',
                        color: withAlpha(WHITE, 0.9),
                      }}
                    >
                      {teamCount}
                    </Text>
                  </YStack>
                  {scoringProfileName && (
                    <YStack gap="$0.5">
                      <Text
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: 1.4,
                          color: withAlpha(WHITE, 0.45),
                        }}
                      >
                        Scoring
                      </Text>
                      <Text
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontSize: 20,
                          fontWeight: '700',
                          color: withAlpha(WHITE, 0.9),
                        }}
                      >
                        {scoringProfileName}
                      </Text>
                    </YStack>
                  )}
                  {league.inviteCode && (
                    <YStack gap="$0.5">
                      <Text
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: 1.4,
                          color: withAlpha(WHITE, 0.45),
                        }}
                      >
                        Invite
                      </Text>
                      <Text
                        style={{
                          fontFamily: "'Roboto Mono', 'Courier New', monospace",
                          fontSize: 15,
                          fontWeight: '700',
                          letterSpacing: 1,
                          color: BRAND_GOLD_LIGHT,
                        }}
                      >
                        {league.inviteCode}
                      </Text>
                    </YStack>
                  )}
                </XStack>
              </YStack>

              {/* Invite button */}
              <Button
                size="$3"
                backgroundColor={
                  headerInviteCopied
                    ? 'rgba(34,197,94,0.15)'
                    : withAlpha(BRAND_GOLD_LIGHT, 0.12)
                }
                borderColor={
                  headerInviteCopied
                    ? 'rgba(34,197,94,0.4)'
                    : withAlpha(BRAND_GOLD_LIGHT, 0.4)
                }
                borderWidth={1}
                borderRadius="$4"
                onPress={handleCopyInviteHeader}
                icon={
                  headerInviteCopied ? (
                    <Check size={15} color="rgb(34, 197, 94)" />
                  ) : (
                    <Share2 size={15} color={BRAND_GOLD_LIGHT} />
                  )
                }
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_GOLD_LIGHT, 0.2),
                }}
                pressStyle={{ scale: 0.97 }}
                animation="quick"
                aria-label="Share invite link"
                alignSelf="flex-start"
              >
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 13,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: headerInviteCopied
                      ? 'rgb(34,197,94)'
                      : BRAND_GOLD_LIGHT,
                  }}
                >
                  {headerInviteCopied ? 'Copied!' : 'Invite'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </ContentArea>

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
                borderBottomColor={isActive ? '$brandGoldLight' : 'transparent'}
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
                <Text
                  fontSize="$3"
                  fontWeight={isActive ? '700' : '600'}
                  color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                  fontFamily={FONT_DISPLAY}
                  textTransform="uppercase"
                  letterSpacing={0.8}
                >
                  {label}
                </Text>
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
                teamsError={leagueTeamsError}
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
          {activeTab === 'history' && (
            <YStack
              role="tabpanel"
              id="panel-history"
              aria-labelledby="tab-history"
              gap="$4"
            >
              <LeagueHistory leagueId={leagueId} />
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
                      <Swords size={32} color="$textMuted" />
                      {selectedMatchupId && !selectedMatchupLoading ? (
                        <>
                          <Text
                            color="$textMuted"
                            fontSize="$5"
                            fontWeight="600"
                          >
                            Matchup Not Found
                          </Text>
                          <Text
                            color="$textMuted"
                            fontSize="$3"
                            textAlign="center"
                            maxWidth={400}
                          >
                            {allLeagueMatchups.length > 0
                              ? 'The requested matchup doesn\u0027t exist. Use the navigation above to browse available matchups.'
                              : 'The requested matchup doesn\u0027t exist or hasn\u0027t been created yet.'}
                          </Text>
                        </>
                      ) : allLeagueMatchups.length > 0 ? (
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
