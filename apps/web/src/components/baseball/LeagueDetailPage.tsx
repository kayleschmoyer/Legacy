import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Card, H1, Separator, Spinner, styled, Text } from 'tamagui';
import {
  Check,
  ChevronLeft,
  ClipboardList,
  Copy,
  Info,
  LayoutGrid,
  Link2,
  QrCode,
  Settings,
  Share2,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from '@tamagui/lucide-icons';
import { QRCodeSVG } from 'qrcode.react';
import { gql } from '@apollo/client';
import { useLazyQuery } from '@apollo/client/react';
import { LeagueActivityFeed } from './LeagueActivityFeed';
import { LeagueScoringSummary } from './LeagueScoringSummary';
import { LeagueScoringEditor } from './LeagueScoringEditor';
import { LeagueTradeBlock } from './LeagueTradeBlock';
import { env } from '../../config/environment';
import {
  LeagueFragment,
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useUpdateTeamMemberPositionMutation,
} from '../../api/db/graphql.generated';
import { LeagueRosterManagement } from '../roster/LeagueRosterManagement';
import { LeagueStandings } from '../roster/LeagueStandings';
import { useLeagueScoringSettings } from '../../lib/scoring';
import { NextStepControl } from '../commissioner/NextStepControl';
import { DeleteLeagueControl } from '../commissioner/DeleteLeagueControl';
import { DraftSettingsControl } from '../commissioner/DraftSettingsControl';
import { useCurrentMatchup } from '../../hooks/useMatchup';
import { MatchupScoreboard } from '../matchup/MatchupScoreboard';
import { GamesRemaining } from '../matchup/GamesRemaining';
import { MatchupRosterComparison } from '../matchup/MatchupRosterComparison';
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
} from '../../store/leagueSlice';

// ── GraphQL ──────────────────────────────────────────────────────────────────

const GET_USER_TEAM_ID = gql`
  query GetUserTeamId($leagueId: Int!) {
    userTeamId(leagueId: $leagueId)
  }
`;

const GET_LEAGUE_TEAMS = gql`
  query GetLeagueTeams($leagueId: Int!) {
    leagueTeams(leagueId: $leagueId) {
      id
      name
      leagueId
    }
  }
`;

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
      return { bg: '$blue3', border: '$blue7', text: '$blue11' };
    case 'completed':
      return { bg: '$green3', border: '$green7', text: '$green11' };
    default:
      return { bg: '$gray3', border: '$gray7', text: '$gray11' };
  }
}

// ── Tab Definitions ──────────────────────────────────────────────────────────

type TabId = 'overview' | 'roster' | 'standings' | 'matchup' | 'commissioner';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  commissionerOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
  { id: 'roster', label: 'My Roster', icon: <ClipboardList size={16} /> },
  { id: 'standings', label: 'Standings', icon: <Trophy size={16} /> },
  { id: 'matchup', label: 'Matchup', icon: <Swords size={16} /> },
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
  standings: 'standings',
  matchup: 'matchup',
  commissioner: 'commissioner',
};

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueDetailPage(): React.JSX.Element {
  const { id, tab: tabParam } = useParams<{ id: string; tab?: string }>();
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
  const { user } = useAuth();

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
      setActiveTab(newTab);
      navigate(`/baseball/league/${leagueId}/${newTab}`, { replace: false });
    },
    [navigate, leagueId],
  );

  // ── Data Fetching ──

  const { data, loading, error } = useGetLeagueByIdQuery({
    skip: isNaN(leagueId) || !!reduxLeagueData,
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
    useLazyQuery(GET_USER_TEAM_ID);

  const [
    getLeagueTeams,
    { data: leagueTeamsData, loading: leagueTeamsLoading },
  ] = useLazyQuery(GET_LEAGUE_TEAMS);

  useEffect(() => {
    if (
      userTeamData &&
      typeof userTeamData === 'object' &&
      'userTeamId' in userTeamData &&
      userTeamData.userTeamId !== undefined
    ) {
      dispatch(setUserTeamId(userTeamData.userTeamId as number | null));
    }
  }, [userTeamData, dispatch]);

  useEffect(() => {
    if (
      leagueTeamsData &&
      typeof leagueTeamsData === 'object' &&
      'leagueTeams' in leagueTeamsData &&
      leagueTeamsData.leagueTeams
    ) {
      dispatch(
        setLeagueTeams(
          leagueTeamsData.leagueTeams as Array<{
            id: number;
            name: string;
            leagueId: number;
          }>,
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

  // ── Derived Data ──

  const userTeamId =
    reduxUserTeamId ??
    (userTeamData &&
    typeof userTeamData === 'object' &&
    'userTeamId' in userTeamData
      ? (userTeamData.userTeamId as number | null)
      : null);
  const league = reduxLeagueData ?? data?.league;
  const positions =
    reduxPositions.length > 0
      ? reduxPositions
      : (positionsData?.leaguePositions as LeaguePositionFragment[]) || [];
  const leagueTeams =
    reduxLeagueTeams.length > 0
      ? reduxLeagueTeams
      : leagueTeamsData &&
          typeof leagueTeamsData === 'object' &&
          'leagueTeams' in leagueTeamsData &&
          Array.isArray(leagueTeamsData.leagueTeams)
        ? leagueTeamsData.leagueTeams
        : [];
  const isCommissioner = reduxIsCommissioner || league?.owner === user?.id;

  const { data: teamMembersData, loading: teamMembersLoading } =
    useGetTeamMembersQuery({
      skip: !userTeamId || reduxTeamMembers.length > 0,
      variables: { teamId: userTeamId || 0 },
    });

  useEffect(() => {
    if (teamMembersData?.teamMembers) {
      dispatch(
        setTeamMembers(
          teamMembersData.teamMembers.filter(
            (m: TeamMemberFragment | null) => m !== null,
          ) as TeamMemberFragment[],
        ),
      );
    }
  }, [teamMembersData, dispatch]);

  const teamMembers =
    reduxTeamMembers.length > 0
      ? reduxTeamMembers
      : (teamMembersData?.teamMembers?.filter(
          (m: TeamMemberFragment | null) => m !== null,
        ) as TeamMemberFragment[]) || [];

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
    profileName: scoringProfileName,
    profile: scoringProfile,
    refetch: refetchScoringProfile,
  } = useLeagueScoringSettings(leagueId);

  const {
    matchup: currentMatchup,
    loading: matchupLoading,
    error: matchupError,
    refetch: refetchMatchup,
  } = useCurrentMatchup(!isNaN(leagueId) ? leagueId : null);

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
        await updateTeamMemberPosition({
          variables: { teamMemberId: player.id, positionId: position.id },
        });
      } catch (error) {
        console.error('Error assigning player:', error);
      }
    },
    [updateTeamMemberPosition],
  );

  const handlePlayerRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      try {
        const assignedPlayer = teamMembersData?.teamMembers?.find(
          (member: TeamMemberFragment | null) =>
            member?.positionId === position.id,
        );
        if (assignedPlayer?.id) {
          await updateTeamMemberPosition({
            variables: { teamMemberId: assignedPlayer.id, positionId: null },
          });
        }
      } catch (error) {
        console.error('Error removing player:', error);
      }
    },
    [updateTeamMemberPosition, teamMembersData?.teamMembers],
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
          <Spinner size="large" color="$blue10" />
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
          <Text fontSize="$8" fontWeight="800" color="$blue11">
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
            {league.currentMatchup || '\u2014'}
          </Text>
        </QuickStatCard>
      </XStack>

      {/* Two-column layout */}
      <XStack gap="$5" flexWrap="wrap" alignItems="flex-start">
        {/* Main column */}
        <YStack flex={2} minWidth={360} gap="$5">
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
                  <Swords size={18} color="var(--blue11)" />
                  <Text fontSize="$5" fontWeight="700" color="$color">
                    Current Matchup
                  </Text>
                </XStack>
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderColor="$blue7"
                  borderWidth={1}
                  borderRadius="$4"
                  color="$blue11"
                  onPress={() => changeTab('matchup')}
                >
                  <Text fontSize="$2" fontWeight="600" color="$blue11">
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
              />
            </Card>
          )}

          {/* Activity Feed */}
          <LeagueActivityFeed
            leagueId={leagueId}
            draftStatus={String(league.draftStatus)}
            currentMatchup={league.currentMatchup}
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
        <YStack flex={1} minWidth={280} maxWidth={380} gap="$5">
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
                  {league.currentMatchup || 'Pre-season'}
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
                  borderColor="$blue7"
                  borderWidth={1}
                  borderRadius="$4"
                  color="$blue11"
                  onPress={() => changeTab('standings')}
                >
                  <Text fontSize="$2" fontWeight="600" color="$blue11">
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
                      userTeamId === team.id ? '$blue3' : 'transparent'
                    }
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
                    {userTeamId === team.id && (
                      <Text fontSize="$1" fontWeight="700" color="$blue11">
                        YOU
                      </Text>
                    )}
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
              <UserPlus size={18} color="var(--blue11)" />
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
                    backgroundColor={inviteLinkCopied ? '$green9' : '$blue9'}
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
                    backgroundColor={linkCopied ? '$green9' : '$blue9'}
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
                    <Text fontSize="$2" fontWeight="600" color="$blue11">
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
          <LeagueTradeBlock leagueId={leagueId} teamMembers={teamMembers} />
        </YStack>
      </XStack>
    </YStack>
  );

  const renderRosterManagement = () => (
    <YStack
      gap="$5"
      role="tabpanel"
      id="panel-roster"
      aria-labelledby="tab-roster"
    >
      <LeagueRosterManagement
        positions={positions}
        teamPlayers={teamMembers}
        onPlayerAssign={(player, position) =>
          void handlePlayerAssign(player, position)
        }
        onPlayerRemove={(player) => void handlePlayerRemove(player)}
        loading={positionsLoading || teamMembersLoading || userTeamLoading}
      />
      <LeagueScoringSummary
        loading={scoringLoading}
        error={scoringError}
        profileName={scoringProfileName}
        settings={scoringSettings}
      />
    </YStack>
  );

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
    <PageContainer role="main" aria-labelledby="league-title">
      {/* Hero Header */}
      <HeroBar
        style={{
          background:
            'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 64, 175, 0.55) 100%)',
        }}
      >
        <XStack alignItems="center" gap="$4" flex={1} flexWrap="wrap">
          <Button
            size="$3"
            backgroundColor="rgba(255,255,255,0.08)"
            borderColor="rgba(255,255,255,0.15)"
            borderWidth={1}
            borderRadius="$4"
            onPress={() => navigate('/baseball')}
            icon={<ChevronLeft size={18} color="white" />}
            aria-label="Back to leagues"
            hoverStyle={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
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
                <Users size={14} color="rgba(255,255,255,0.6)" />
                <Text fontSize="$3" color="rgba(255,255,255,0.7)">
                  {teamCount} teams
                </Text>
              </XStack>
              <Text fontSize="$3" color="rgba(255,255,255,0.3)">
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
              {league.currentMatchup && (
                <>
                  <Text fontSize="$3" color="rgba(255,255,255,0.3)">
                    |
                  </Text>
                  <Text fontSize="$3" color="rgba(255,255,255,0.7)">
                    Week {league.currentMatchup}
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
            backgroundColor="rgba(59, 130, 246, 0.16)"
            borderColor="rgba(59, 130, 246, 0.4)"
            borderWidth={1}
            borderRadius="$4"
            onPress={handleCopyInviteLink}
            icon={
              inviteLinkCopied ? (
                <Check size={16} color="rgb(34, 197, 94)" />
              ) : (
                <Share2 size={16} color="rgb(96, 165, 250)" />
              )
            }
            hoverStyle={{ backgroundColor: 'rgba(59, 130, 246, 0.24)' }}
            aria-label="Share invite link"
          >
            <Text
              fontSize="$3"
              fontWeight="600"
              color={inviteLinkCopied ? '$green11' : '$blue11'}
            >
              {inviteLinkCopied ? 'Copied!' : 'Invite'}
            </Text>
          </Button>
        </XStack>
      </HeroBar>

      {/* Tab Navigation */}
      <TabBar role="tablist" aria-label="League sections">
        {TABS.map((tab) => {
          if (tab.commissionerOnly && !isCommissioner) return null;
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              backgroundColor="transparent"
              borderWidth={0}
              borderBottomWidth={2}
              borderBottomColor={isActive ? '$blue9' : 'transparent'}
              borderRadius={0}
              paddingHorizontal="$4"
              paddingVertical="$3"
              onPress={() => changeTab(tab.id)}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              hoverStyle={{
                backgroundColor: 'rgba(59, 130, 246, 0.06)',
              }}
              pressStyle={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
              }}
            >
              <XStack alignItems="center" gap="$2">
                <YStack opacity={isActive ? 1 : 0.5}>{tab.icon}</YStack>
                <Text
                  fontSize="$3"
                  fontWeight={isActive ? '700' : '500'}
                  color={isActive ? '$blue11' : '$textMuted'}
                >
                  {tab.label}
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
        {activeTab === 'standings' && (
          <YStack
            role="tabpanel"
            id="panel-standings"
            aria-labelledby="tab-standings"
          >
            <LeagueStandings
              teams={leagueTeams}
              loading={leagueTeamsLoading}
              userTeamId={userTeamId}
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
            ) : currentMatchup ? (
              <YStack gap="$4">
                <MatchupScoreboard
                  matchup={currentMatchup}
                  gamesRemaining={
                    (currentMatchup.gamesPerMatchup ?? 0) -
                    (currentMatchup.selectedGamesCount ?? 0)
                  }
                />
                {currentMatchup.gamesPerMatchup && (
                  <GamesRemaining
                    gamesRemaining={
                      (currentMatchup.gamesPerMatchup ?? 0) -
                      (currentMatchup.selectedGamesCount ?? 0)
                    }
                    totalGames={currentMatchup.gamesPerMatchup}
                  />
                )}
                <MatchupRosterComparison matchup={currentMatchup} />
                {(currentMatchup.startTime || currentMatchup.endTime) && (
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
                        {currentMatchup.startTime && (
                          <Text fontSize="$2" color="$textMuted">
                            Start:{' '}
                            {new Date(
                              String(currentMatchup.startTime),
                            ).toLocaleString()}
                          </Text>
                        )}
                        {currentMatchup.endTime && (
                          <Text fontSize="$2" color="$textMuted">
                            End:{' '}
                            {new Date(
                              String(currentMatchup.endTime),
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
                      backgroundColor="$blue9"
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
        {activeTab === 'commissioner' &&
          isCommissioner &&
          renderCommissionerSettings()}
      </ContentArea>
    </PageContainer>
  );
}

export default LeagueDetailPage;
