import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Dialog, Input, Separator, styled, Text } from 'tamagui';
import type { League } from './LeagueCard';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
} from '../../api/db/graphql.generated';

/* ─── Draft Status Helpers ─── */

function getLeagueBadge(
  draftStatus?: string | null,
  weekNumber?: number | null,
): { label: string; bg: string; border: string; text: string } {
  switch (draftStatus) {
    case 'in-progress':
      return {
        label: 'Drafting',
        bg: 'rgba(59, 130, 246, 0.14)',
        border: 'rgba(59, 130, 246, 0.38)',
        text: '$blue11',
      };
    case 'completed':
      return {
        label: weekNumber ? `Week ${weekNumber}` : 'In Season',
        bg: 'rgba(34, 197, 94, 0.14)',
        border: 'rgba(34, 197, 94, 0.36)',
        text: '$green11',
      };
    case 'queued':
    case 'not-started':
      return {
        label: 'Draft Scheduled',
        bg: 'rgba(251, 191, 36, 0.12)',
        border: 'rgba(251, 191, 36, 0.30)',
        text: '$orange11',
      };
    default:
      return {
        label: draftStatus
          ? draftStatus
              .replace('-', ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase())
          : 'Unknown',
        bg: 'rgba(148, 163, 184, 0.12)',
        border: 'rgba(148, 163, 184, 0.30)',
        text: '$gray11',
      };
  }
}

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingHorizontal: '$4',
  paddingBottom: '$10',
  paddingTop: '$6',
  $sm: {
    paddingHorizontal: '$3',
    paddingTop: '$4',
  },
});

const ContentContainer = styled(YStack, {
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  gap: '$9',
});

const HeroSection = styled(XStack, {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$8',
  borderWidth: 1,
  borderColor: 'rgba(59, 130, 246, 0.22)',
  padding: '$9',
  gap: '$8',
  alignItems: 'stretch',
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 20 },
  $md: {
    flexDirection: 'column',
    padding: '$7',
  },
  $sm: {
    padding: '$6',
  },
});

const HeroContent = styled(YStack, {
  flex: 1,
  gap: '$4',
  maxWidth: 620,
});

const HeroBadge = styled(XStack, {
  alignSelf: 'flex-start',
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  backgroundColor: 'rgba(59, 130, 246, 0.16)',
  borderWidth: 1,
  borderColor: 'rgba(37, 99, 235, 0.40)',
  animation: 'medium',
  enterStyle: { opacity: 0, scale: 0.9 },
});

const HeroTitle = styled(H1, {
  fontSize: '$12',
  fontWeight: '800',
  lineHeight: '$12',
  color: '$color',
  letterSpacing: -0.5,
  animation: 'medium',
  enterStyle: { opacity: 0, x: -15 },
  $sm: {
    fontSize: '$10',
    lineHeight: '$10',
  },
});

const HeroSubtitle = styled(Paragraph, {
  fontSize: '$5',
  color: 'rgba(226, 232, 240, 0.92)',
  lineHeight: '$6',
  maxWidth: 520,
  animation: 'medium',
  enterStyle: { opacity: 0, y: 10 },
  $sm: {
    fontSize: '$4',
    lineHeight: '$5',
  },
});

const ActionButtonsRow = styled(XStack, {
  gap: '$3',
  flexWrap: 'wrap',
  alignItems: 'center',
});

const PrimaryButton = styled(Button, {
  borderRadius: '$6',
  height: '$6',
  fontSize: '$4',
  fontWeight: '700',
  paddingHorizontal: '$6',
  color: '$color1',
  backgroundColor: '$blue10',
  borderColor: 'transparent',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: '$blue9',
    transform: 'translateY(-2px)',
    shadowColor: 'rgba(59, 130, 246, 0.45)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  pressStyle: {
    backgroundColor: '$blue11',
    scale: 0.98,
  },
});

const SecondaryButton = styled(Button, {
  borderRadius: '$6',
  height: '$6',
  fontSize: '$4',
  fontWeight: '700',
  paddingHorizontal: '$6',
  backgroundColor: 'rgba(59, 130, 246, 0.08)',
  borderColor: 'rgba(59, 130, 246, 0.35)',
  borderWidth: 1,
  color: '$blue10',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: 'rgba(59, 130, 246, 0.55)',
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: 'rgba(59, 130, 246, 0.20)',
    scale: 0.98,
  },
});

const HeroSidePanel = styled(YStack, {
  width: '100%',
  maxWidth: 380,
  marginLeft: 'auto',
  gap: '$4',
});

const StatsCard = styled(YStack, {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  borderRadius: '$7',
  padding: '$6',
  borderWidth: 1,
  borderColor: 'rgba(59, 130, 246, 0.18)',
  gap: '$4',
  shadowColor: 'rgba(59, 130, 246, 0.12)',
  shadowOpacity: 0.6,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  animation: 'medium',
  enterStyle: { opacity: 0, y: 15 },
  hoverStyle: {
    borderColor: 'rgba(59, 130, 246, 0.30)',
  },
});

const StatsHeader = styled(YStack, {
  gap: '$1',
});

const StatsGrid = styled(XStack, {
  flexWrap: 'wrap',
  gap: '$4',
});

const StatItem = styled(YStack, {
  minWidth: 120,
  flexGrow: 1,
  gap: '$1',
});

const StatValue = styled(H2, {
  fontSize: '$9',
  fontWeight: '800',
  color: '$blue10',
  animation: 'medium',
  enterStyle: { opacity: 0, scale: 0.8 },
});

const StatLabel = styled(Paragraph, {
  fontSize: '$3',
  color: 'rgba(148, 163, 184, 0.85)',
  textTransform: 'uppercase',
  letterSpacing: 1,
});

const QuickGlanceCard = styled(YStack, {
  backgroundColor: 'rgba(30, 41, 59, 0.72)',
  borderRadius: '$7',
  padding: '$5',
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.14)',
  gap: '$3',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 15 },
  hoverStyle: {
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
});

const QuickGlanceRow = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
});

const QuickGlanceDot = styled(YStack, {
  width: 10,
  height: 10,
  borderRadius: 9999,
  backgroundColor: '$blue9',
  shadowColor: '$blue9',
  shadowOpacity: 0.6,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 0 },
});

const LeaguesSection = styled(YStack, {
  gap: '$5',
});

const SectionHeader = styled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: '$4',
  $md: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
});

const SectionTitle = styled(H2, {
  fontSize: '$9',
  fontWeight: '700',
  color: '$color',
  animation: 'medium',
  enterStyle: { opacity: 0, x: -10 },
});

const SectionDescription = styled(Paragraph, {
  fontSize: '$3',
  color: 'rgba(148, 163, 184, 0.9)',
});

const LeaguesList = styled(YStack, {
  gap: '$3',
  width: '100%',
});

const LeagueRowOuter = styled(XStack, {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.14)',
  padding: '$4',
  paddingHorizontal: '$5',
  alignItems: 'center',
  gap: '$5',
  cursor: 'pointer',
  animation: 'medium',
  enterStyle: { opacity: 0, x: -12 },
  hoverStyle: {
    borderColor: 'rgba(59, 130, 246, 0.40)',
    transform: 'translateX(4px)',
  },
  pressStyle: {
    scale: 0.995,
    borderColor: 'rgba(59, 130, 246, 0.50)',
  },
  $sm: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '$4',
    gap: '$3',
  },
});

const LeagueRowMeta = styled(XStack, {
  alignItems: 'center',
  gap: '$4',
  flexWrap: 'wrap',
  $sm: {
    gap: '$3',
  },
});

const WeekStatusChip = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$5',
  borderWidth: 1,
});

const DraftBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$5',
  borderWidth: 1,
});

const ViewLeagueButton = styled(Button, {
  borderRadius: '$5',
  paddingHorizontal: '$4',
  height: '$3',
  backgroundColor: 'rgba(37, 99, 235, 0.14)',
  borderColor: 'rgba(59, 130, 246, 0.40)',
  borderWidth: 1,
  color: '$blue11',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
    borderColor: 'rgba(59, 130, 246, 0.60)',
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    scale: 0.98,
  },
});

const EmptyState = styled(YStack, {
  alignItems: 'center',
  padding: '$10',
  gap: '$5',
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: 'rgba(59, 130, 246, 0.18)',
  minHeight: 320,
  justifyContent: 'center',
  textAlign: 'center',
  shadowColor: 'rgba(59, 130, 246, 0.08)',
  shadowOpacity: 0.5,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  animation: 'medium',
  enterStyle: { opacity: 0, y: 20 },
});

const EmptyStateIcon = styled(YStack, {
  fontSize: '3.2rem',
  animation: 'bouncy',
  enterStyle: { opacity: 0, scale: 0.5, y: -20 },
});

const EmptyStateTitle = styled(H2, {
  fontSize: '$8',
  fontWeight: '700',
  color: '$color',
});

const EmptyStateDescription = styled(Paragraph, {
  fontSize: '$4',
  color: 'rgba(148, 163, 184, 0.92)',
  maxWidth: 440,
});

const SearchContainer = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.24)',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  animation: 'quick',
  hoverStyle: {
    borderColor: 'rgba(59, 130, 246, 0.40)',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
  },
  focusStyle: {
    borderColor: 'rgba(59, 130, 246, 0.55)',
  },
});

const NoticeCard = styled(YStack, {
  backgroundColor: 'rgba(37, 99, 235, 0.12)',
  borderRadius: '$6',
  padding: '$5',
  borderWidth: 1,
  borderColor: 'rgba(37, 99, 235, 0.30)',
  gap: '$3',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 10 },
});

export function BaseballLandingPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [leagueName, setLeagueName] = React.useState('');
  const [teamCount, setTeamCount] = React.useState<number>(10);
  const [search, setSearch] = React.useState('');

  // Fetch user leagues from GraphQL
  const {
    data,
    loading: isLoading,
    error,
  } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !auth?.user,
  });

  const [createLeague, { loading: creating }] = useCreateLeagueAndTeamsMutation(
    {
      update: (cache, { data }) => {
        const newLeague = data?.createLeagueAndTeams?.league;
        if (!newLeague) return;
        try {
          const existing = cache.readQuery<GetUserLeaguesQuery>({
            query: GetUserLeagues,
          });
          if (existing?.userLeagues) {
            cache.writeQuery({
              query: GetUserLeagues,
              data: { userLeagues: [...existing.userLeagues, newLeague] },
            });
          }
        } catch {
          // ignore; query may not be in cache yet
        }
      },
    },
  );

  // Map GraphQL data to our League interface
  const leagues: League[] =
    (data?.userLeagues?.map((league) => ({
      id: league.id || 0,
      name: league.name || '',
      owner: league.owner || 0,
      maxRosterSize: league.maxRosterSize || 25,
      currentMatchup: league.currentMatchup,
      currentWeekNumber: league.currentWeekNumber,
      draftStatus: league.draftStatus || undefined,
      weekAdvanceStatus: league.weekAdvanceStatus,
    })) as League[]) || [];

  const leaguesCount = leagues.length;
  const averageRosterSize =
    leaguesCount > 0
      ? Math.round(
          leagues.reduce(
            (total, league) => total + (league.maxRosterSize || 0),
            0,
          ) / leaguesCount,
        )
      : 0;
  const currentWeek =
    leagues.reduce(
      (maxWeek, league) =>
        league.currentWeekNumber && league.currentWeekNumber > maxWeek
          ? league.currentWeekNumber
          : maxWeek,
      1,
    ) || 1;
  const upcomingDrafts = leagues.filter((league) =>
    league.draftStatus
      ? ['not-started', 'queued', 'scheduled'].includes(league.draftStatus)
      : false,
  ).length;
  const userName = auth?.user?.username || 'Manager';
  const hasLeagues = leaguesCount > 0;
  const safeCurrentWeek = currentWeek > 0 ? currentWeek : 1;
  const currentYear = new Date().getFullYear();

  const heroSubtitleCopy = hasLeagues
    ? `You're managing ${leaguesCount} league${
        leaguesCount === 1 ? '' : 's'
      }. Keep building momentum with streamlined tools and insights.`
    : 'Launch your first fantasy baseball league in minutes and lead your team from draft day to the trophy presentation.';

  const quickWins = hasLeagues
    ? [
        `Monitor week ${safeCurrentWeek} matchups and finalize starters.`,
        `Average rosters hold ${averageRosterSize} players - adjust slots as needed.`,
        'Share invite codes to bring new managers into the action.',
      ]
    : [
        'Decide how many teams you want in your new league.',
        'Lock in a draft date that fits every manager.',
        'Use invite codes to bring your league together in seconds.',
      ];

  const pageBackgroundStyle = React.useMemo(
    () => ({
      background: `
        radial-gradient(ellipse at 10% 15%, rgba(59, 130, 246, 0.22) 0%, transparent 50%),
        radial-gradient(ellipse at 90% 10%, rgba(14, 165, 233, 0.14) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, rgba(37, 99, 235, 0.06) 0%, transparent 60%),
        radial-gradient(ellipse at 15% 85%, rgba(15, 118, 110, 0.10) 0%, transparent 50%),
        linear-gradient(180deg, rgba(2, 6, 23, 0.95) 0%, hsl(var(--background)) 100%)
      `,
      backgroundAttachment: 'fixed',
    }),
    [],
  );

  const handleViewLeague = (leagueId: number) => {
    navigate(`/baseball/league/${leagueId}`);
  };

  const handleCreateLeague = () => {
    setShowCreateDialog(true);
  };

  const handleJoinLeague = () => {
    navigate('/baseball/league/join');
  };

  if (isLoading) {
    return (
      <PageContainer
        role="main"
        aria-busy="true"
        aria-live="polite"
        style={pageBackgroundStyle}
      >
        <ContentContainer>
          <YStack
            alignItems="center"
            justifyContent="center"
            flex={1}
            minHeight={400}
            role="status"
          >
            <Paragraph fontSize="$6" color="$color11">
              Loading your leagues...
            </Paragraph>
          </YStack>
        </ContentContainer>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer
        role="main"
        aria-live="assertive"
        style={pageBackgroundStyle}
      >
        <ContentContainer>
          <YStack
            alignItems="center"
            justifyContent="center"
            flex={1}
            minHeight={400}
            gap="$4"
            role="alert"
          >
            <Paragraph fontSize="$6" color="$red10">
              Failed to load leagues
            </Paragraph>
            <SecondaryButton onPress={() => window.location.reload()}>
              <Text>Try Again</Text>
            </SecondaryButton>
          </YStack>
        </ContentContainer>
      </PageContainer>
    );
  }

  const filteredLeagues = leagues.filter((l) =>
    (l?.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PageContainer
      role="main"
      aria-label="Baseball fantasy landing page"
      style={pageBackgroundStyle}
    >
      <ContentContainer>
        <HeroSection
          role="region"
          aria-labelledby="baseball-hero-title"
          style={{
            background:
              'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 64, 175, 0.55) 50%, rgba(37, 99, 235, 0.35) 100%)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow:
              '0 8px 32px rgba(59, 130, 246, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <HeroContent>
            <HeroBadge>
              <Text fontSize="$2" fontWeight="600" color="$blue11">
                <span role="img" aria-label="baseball">
                  ⚾
                </span>{' '}
                {currentYear} Season Hub
              </Text>
            </HeroBadge>
            <HeroTitle id="baseball-hero-title">Baseball Fantasy</HeroTitle>
            <HeroSubtitle>
              {`Welcome back, ${userName}. ${heroSubtitleCopy}`}
            </HeroSubtitle>
            <ActionButtonsRow marginTop="$3">
              <PrimaryButton
                onPress={handleCreateLeague}
                accessibilityLabel="Create a new baseball league"
              >
                <Text fontWeight="700">Create League</Text>
              </PrimaryButton>
              <SecondaryButton
                onPress={handleJoinLeague}
                accessibilityLabel="Join an existing baseball league"
              >
                <Text fontWeight="700">Join League</Text>
              </SecondaryButton>
            </ActionButtonsRow>
            <Paragraph
              fontSize="$3"
              color="rgba(148, 163, 184, 0.9)"
              maxWidth={440}
            >
              Draft-ready controls, transparent roster limits, and secure
              invitations built for competitive fantasy managers.
            </Paragraph>
          </HeroContent>

          <HeroSidePanel>
            <StatsCard
              style={{
                background:
                  'linear-gradient(160deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              <StatsHeader>
                <Paragraph
                  fontSize="$3"
                  color="rgba(148, 163, 184, 0.85)"
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  Season Snapshot
                </Paragraph>
                <H3 size="$7" color="$color">
                  Stay ahead of every matchup
                </H3>
              </StatsHeader>
              <Separator backgroundColor="rgba(148, 163, 184, 0.12)" />
              <StatsGrid>
                <StatItem>
                  <StatValue>{leaguesCount}</StatValue>
                  <StatLabel>Active Leagues</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>{safeCurrentWeek}</StatValue>
                  <StatLabel>Current Week</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>{averageRosterSize}</StatValue>
                  <StatLabel>Avg Roster Size</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>{upcomingDrafts}</StatValue>
                  <StatLabel>Upcoming Drafts</StatLabel>
                </StatItem>
              </StatsGrid>
            </StatsCard>

            <QuickGlanceCard
              style={{
                background:
                  'linear-gradient(160deg, rgba(30, 41, 59, 0.80) 0%, rgba(15, 23, 42, 0.65) 100%)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
              }}
            >
              <Paragraph
                fontSize="$3"
                color="rgba(148, 163, 184, 0.85)"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Quick Wins
              </Paragraph>
              <Paragraph fontSize="$4" color="$color">
                Make sure your league is ready before first pitch.
              </Paragraph>
              {quickWins.map((item, index) => (
                <QuickGlanceRow key={index}>
                  <QuickGlanceDot />
                  <Paragraph fontSize="$3" color="rgba(203, 213, 225, 0.9)">
                    {item}
                  </Paragraph>
                </QuickGlanceRow>
              ))}
            </QuickGlanceCard>
          </HeroSidePanel>
        </HeroSection>

        {!auth?.user && (
          <NoticeCard>
            <Paragraph fontSize="$4" color="$blue11" fontWeight="600">
              Sign in to manage your fantasy baseball leagues
            </Paragraph>
            <Paragraph fontSize="$3" color="$blue10">
              Authentication is required to access drafts, invite codes, and
              lineup management.
            </Paragraph>
          </NoticeCard>
        )}

        <LeaguesSection role="region" aria-labelledby="your-leagues-title">
          <SectionHeader>
            <YStack gap="$2">
              <SectionTitle id="your-leagues-title">Your Leagues</SectionTitle>
              <SectionDescription>
                {hasLeagues
                  ? 'Select a league to review rosters, matchups, and draft plans.'
                  : 'Create or join a league to unlock your personalized season dashboard.'}
              </SectionDescription>
            </YStack>
            {hasLeagues && (
              <YStack gap="$2" width="100%" maxWidth={340}>
                <label htmlFor="league-search" className="sr-only">
                  Search leagues
                </label>
                <SearchContainer role="search">
                  <Input
                    id="league-search"
                    size="$4"
                    placeholder="Search leagues..."
                    value={search}
                    onChangeText={setSearch}
                    backgroundColor="transparent"
                    borderWidth={0}
                    flex={1}
                    aria-label="Search leagues"
                  />
                </SearchContainer>
              </YStack>
            )}
          </SectionHeader>

          {filteredLeagues.length > 0 ? (
            <LeaguesList data-testid="leagues-grid">
              {filteredLeagues.map((league) => {
                const badge = getLeagueBadge(
                  league.draftStatus,
                  league.currentWeekNumber,
                );

                return (
                  <LeagueRowOuter
                    key={league.id}
                    onPress={() => league.id && handleViewLeague(league.id)}
                    accessibilityLabel={`View ${league.name || 'league'}`}
                    role="link"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(15, 23, 42, 0.78) 0%, rgba(30, 41, 59, 0.55) 100%)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    }}
                  >
                    {/* League identity */}
                    <YStack gap="$1" flex={1} minWidth={180}>
                      <H3 fontSize="$6" fontWeight="700" color="$color">
                        {league.name || 'Unnamed League'}
                      </H3>
                      <Paragraph fontSize="$2" color="$textMuted">
                        {league.maxRosterSize
                          ? `${league.maxRosterSize}-slot roster`
                          : 'Season dashboard'}
                      </Paragraph>
                    </YStack>

                    {/* Status indicators */}
                    <LeagueRowMeta>
                      <DraftBadge
                        backgroundColor={badge.bg}
                        borderColor={badge.border}
                      >
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          color={badge.text}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          {badge.label}
                        </Text>
                      </DraftBadge>
                      {league.weekAdvanceStatus === 'processing' ||
                      league.weekAdvanceStatus === 'queued' ? (
                        <WeekStatusChip
                          backgroundColor="rgba(234, 179, 8, 0.12)"
                          borderColor="rgba(234, 179, 8, 0.35)"
                        >
                          <Text
                            fontSize={11}
                            fontWeight="600"
                            color="$yellow10"
                          >
                            <span role="img" aria-label="hourglass">
                              ⏳
                            </span>{' '}
                            Advancing
                          </Text>
                        </WeekStatusChip>
                      ) : league.weekAdvanceStatus === 'failed' ? (
                        <WeekStatusChip
                          backgroundColor="rgba(239, 68, 68, 0.12)"
                          borderColor="rgba(239, 68, 68, 0.35)"
                        >
                          <Text fontSize={11} fontWeight="600" color="$red10">
                            <span role="img" aria-label="warning">
                              ⚠
                            </span>{' '}
                            Advance failed
                          </Text>
                        </WeekStatusChip>
                      ) : null}
                    </LeagueRowMeta>

                    {/* Action */}
                    <ViewLeagueButton
                      onPress={() => league.id && handleViewLeague(league.id)}
                      accessibilityLabel={`View ${league.name || 'league'}`}
                    >
                      <Text fontWeight="700" color="$blue11" fontSize="$2">
                        View
                      </Text>
                    </ViewLeagueButton>
                  </LeagueRowOuter>
                );
              })}
            </LeaguesList>
          ) : (
            <EmptyState
              style={{
                background:
                  'linear-gradient(135deg, rgba(15, 23, 42, 0.80) 0%, rgba(30, 64, 175, 0.18) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <EmptyStateIcon>
                <Text aria-hidden="true">⚾</Text>
              </EmptyStateIcon>
              <EmptyStateTitle>No leagues yet</EmptyStateTitle>
              <EmptyStateDescription>
                Build a private competition or join friends to unlock live
                matchups, draft tools, and performance tracking.
              </EmptyStateDescription>
              <ActionButtonsRow justifyContent="center">
                <PrimaryButton onPress={handleCreateLeague}>
                  <Text fontWeight="700">Create your first league</Text>
                </PrimaryButton>
                <SecondaryButton onPress={handleJoinLeague}>
                  <Text fontWeight="700">Join with a code</Text>
                </SecondaryButton>
              </ActionButtonsRow>
            </EmptyState>
          )}
        </LeaguesSection>
      </ContentContainer>

      {/* Create League - Quick Dialog */}
      <Dialog modal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay
            animation="medium"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
            backgroundColor="rgba(0, 0, 0, 0.65)"
          />
          <Dialog.Content
            bordered
            elevate
            maxWidth={560}
            width="100%"
            backgroundColor="$color2"
            borderColor="rgba(59, 130, 246, 0.22)"
            borderRadius="$7"
            animation="bouncy"
            enterStyle={{ opacity: 0, y: -20, scale: 0.96 }}
            exitStyle={{ opacity: 0, y: 10, scale: 0.98 }}
            aria-labelledby="create-league-title"
            aria-describedby="create-league-desc"
            style={{
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow:
                '0 16px 48px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(59, 130, 246, 0.08)',
            }}
          >
            <YStack space="$4">
              <YStack>
                <H2 size="$6" id="create-league-title">
                  Create League
                </H2>
                <Paragraph color="$gray11" id="create-league-desc">
                  Create a new league in seconds. You can fine-tune settings
                  later.
                </Paragraph>
              </YStack>

              <YStack space="$3">
                <Text fontWeight="600" color="$gray12">
                  League Name
                </Text>
                <Input
                  placeholder="e.g., Saturday Sluggers"
                  value={leagueName}
                  onChangeText={setLeagueName}
                  autoFocus
                  aria-label="League name"
                />
              </YStack>

              <YStack space="$3">
                <Text fontWeight="600" color="$gray12">
                  Number of Teams
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {[6, 8, 10, 12, 14, 16].map((n) => (
                    <Button
                      key={n}
                      size="$3"
                      variant={teamCount === n ? 'primary' : 'outlined'}
                      onPress={() => setTeamCount(n)}
                      backgroundColor={teamCount === n ? '$blue8' : '$color2'}
                      borderColor={teamCount === n ? '$blue8' : '$borderColor'}
                      borderWidth={teamCount === n ? 2 : 1}
                      aria-pressed={teamCount === n}
                      aria-label={`Select ${n} teams`}
                    >
                      <Text color={teamCount === n ? '$blue12' : '$color'}>
                        {n}
                      </Text>
                    </Button>
                  ))}
                </XStack>
              </YStack>

              <Separator />

              <XStack justifyContent="flex-end" gap="$3">
                <Dialog.Close asChild>
                  <SecondaryButton disabled={creating}>Cancel</SecondaryButton>
                </Dialog.Close>
                <PrimaryButton
                  disabled={creating || leagueName.trim().length < 3}
                  onPress={() => {
                    const startDate = new Date(
                      Date.now() + 7 * 24 * 60 * 60 * 1000,
                    )
                      .toISOString()
                      .split('T')[0];
                    void createLeague({
                      variables: {
                        input: {
                          leagueName: leagueName.trim(),
                          numberOfTeams: teamCount,
                          playerPool: 'all',
                          draftMode: 'live',
                          selectionMethod: 'standard',
                          draftOrder: 'snake',
                          maxRosterSize: 25,
                          startDate,
                          isPublic: false,
                          tradingEnabled: true,
                          waiverEnabled: true,
                        },
                      },
                    }).then((result) => {
                      const id = result.data?.createLeagueAndTeams?.league?.id;
                      if (id) navigate(`/baseball/league/${id}`);
                    });
                  }}
                >
                  {creating ? 'Creating…' : 'Create League'}
                </PrimaryButton>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </PageContainer>
  );
}
