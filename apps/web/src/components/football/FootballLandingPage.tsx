import React from 'react';
import type { GestureResponderEvent } from 'react-native';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H3,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Input,
  Spinner,
  styled,
  Text,
  H1 as TH1,
  H2 as TH2,
  Paragraph as TParagraph,
} from 'tamagui';
import {
  formatDraftStatusForCard,
  getDraftStatusColors,
} from '@legacy-sports/shared-components/utils';
import { PageMeta } from '../PageMeta';
import { Sport, useGetUserLeaguesQuery } from '../../api/db/graphql.generated';
import { formatDisplayName } from '../../lib/formatDisplayName';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  INJURY_OUT,
  SURFACE_CARD,
  SURFACE_PANEL,
  WHITE,
  withAlpha,
  YELLOW,
} from '../../constants/colors';

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
  borderColor: '$glassBorder',
  padding: '$9',
  gap: '$8',
  alignItems: 'stretch',
  backgroundColor: '$glassSurface',
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
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
  animation: 'medium',
  enterStyle: { opacity: 0, scale: 0.9 },
});

const HeroTitle = styled(TH1, {
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

const HeroSubtitle = styled(TParagraph, {
  fontSize: '$5',
  color: '$glassTextSubdued',
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
  backgroundColor: BRAND_NAVY_LIGHT,
  borderColor: 'transparent',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: BRAND_NAVY,
    transform: 'translateY(-2px)',
    shadowColor: withAlpha(BRAND_NAVY, 0.5),
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  pressStyle: {
    backgroundColor: BRAND_NAVY_DARK,
    scale: 0.98,
  },
});

const SecondaryButton = styled(Button, {
  borderRadius: '$6',
  height: '$6',
  fontSize: '$4',
  fontWeight: '700',
  paddingHorizontal: '$6',
  backgroundColor: withAlpha(BRAND_NAVY, 0.12),
  borderColor: withAlpha(BRAND_NAVY, 0.42),
  borderWidth: 1,
  color: BRAND_GOLD_LIGHT,
  animation: 'quick',
  hoverStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.22),
    borderColor: withAlpha(BRAND_NAVY, 0.6),
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.28),
    scale: 0.98,
  },
});

const HeroSidePanel = styled(YStack, {
  width: '100%',
  maxWidth: 380,
  marginLeft: 'auto',
  gap: '$4',
});

const SideCard = styled(YStack, {
  backgroundColor: '$glassSurfaceLight',
  borderRadius: '$7',
  padding: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  gap: '$4',
  shadowColor: withAlpha(BRAND_NAVY, 0.16),
  shadowOpacity: 0.6,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  animation: 'medium',
  enterStyle: { opacity: 0, y: 15 },
  hoverStyle: {
    borderColor: '$glassBorderHover',
  },
});

const QuickGlanceCard = styled(YStack, {
  backgroundColor: withAlpha(SURFACE_PANEL, 0.72),
  borderRadius: '$7',
  padding: '$5',
  borderWidth: 1,
  borderColor: '$glassBorder',
  gap: '$3',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 15 },
});

const QuickGlanceRow = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
});

const QuickGlanceDot = styled(YStack, {
  width: 10,
  height: 10,
  borderRadius: 9999,
  backgroundColor: BRAND_NAVY_LIGHT,
  shadowColor: BRAND_NAVY_LIGHT,
  shadowOpacity: 0.6,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 0 },
});

const CompactHeroBanner = styled(XStack, {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$5',
  paddingHorizontal: '$6',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '$5',
  backgroundColor: '$glassSurface',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 12 },
  $md: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$4',
  },
  $sm: {
    padding: '$4',
  },
});

const CompactHeroLeft = styled(XStack, {
  alignItems: 'center',
  gap: '$4',
  flex: 1,
  minWidth: 0,
  $sm: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$2',
  },
});

const CompactTitle = styled(TH2, {
  fontSize: '$8',
  fontWeight: '800',
  color: '$color',
  letterSpacing: -0.3,
  $sm: {
    fontSize: '$7',
  },
});

const CompactWelcome = styled(TParagraph, {
  fontSize: '$3',
  color: '$glassTextSubdued',
});

const CompactActions = styled(XStack, {
  gap: '$2',
  flexShrink: 0,
  flexWrap: 'wrap',
});

const CompactPrimaryButton = styled(Button, {
  borderRadius: '$5',
  height: '$4',
  fontSize: '$2',
  fontWeight: '700',
  paddingHorizontal: '$4',
  color: '$color1',
  backgroundColor: BRAND_NAVY_LIGHT,
  borderColor: 'transparent',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: BRAND_NAVY,
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: BRAND_NAVY_DARK,
    scale: 0.98,
  },
});

const CompactButton = styled(Button, {
  borderRadius: '$5',
  height: '$4',
  fontSize: '$2',
  fontWeight: '700',
  paddingHorizontal: '$4',
  backgroundColor: withAlpha(BRAND_NAVY, 0.14),
  borderColor: withAlpha(BRAND_NAVY, 0.42),
  borderWidth: 1,
  color: BRAND_GOLD_LIGHT,
  animation: 'quick',
  hoverStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.24),
    borderColor: withAlpha(BRAND_NAVY, 0.6),
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.28),
    scale: 0.98,
  },
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

const SectionTitle = styled(TH2, {
  fontSize: '$9',
  fontWeight: '700',
  color: '$color',
  animation: 'medium',
  enterStyle: { opacity: 0, x: -10 },
});

const SectionDescription = styled(TParagraph, {
  fontSize: '$3',
  color: '$glassTextMuted',
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
  borderColor: '$glassBorder',
  padding: '$4',
  paddingHorizontal: '$5',
  alignItems: 'center',
  gap: '$5',
  cursor: 'pointer',
  animation: 'medium',
  enterStyle: { opacity: 0, x: -12 },
  hoverStyle: {
    borderColor: withAlpha(BRAND_NAVY, 0.5),
    transform: 'translateX(4px)',
  },
  pressStyle: {
    scale: 0.995,
    borderColor: withAlpha(BRAND_NAVY, 0.6),
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

const SportBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$5',
  borderWidth: 1,
  backgroundColor: withAlpha(BRAND_NAVY, 0.18),
  borderColor: withAlpha(BRAND_NAVY, 0.45),
});

const DraftBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$5',
  borderWidth: 1,
});

const WeekStatusChip = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$5',
  borderWidth: 1,
});

const ViewLeagueButton = styled(Button, {
  borderRadius: '$5',
  paddingHorizontal: '$4',
  height: '$3',
  backgroundColor: withAlpha(BRAND_NAVY, 0.16),
  borderColor: withAlpha(BRAND_NAVY, 0.45),
  borderWidth: 1,
  color: BRAND_GOLD_LIGHT,
  animation: 'quick',
  hoverStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.26),
    borderColor: withAlpha(BRAND_NAVY, 0.65),
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.2),
    scale: 0.98,
  },
});

const EmptyState = styled(YStack, {
  alignItems: 'center',
  padding: '$10',
  gap: '$5',
  backgroundColor: '$glassSurface',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  minHeight: 320,
  justifyContent: 'center',
  textAlign: 'center',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 20 },
});

const EmptyStateIcon = styled(YStack, {
  fontSize: '3.2rem',
  animation: 'bouncy',
  enterStyle: { opacity: 0, scale: 0.5, y: -20 },
});

const EmptyStateTitle = styled(TH2, {
  fontSize: '$8',
  fontWeight: '700',
  color: '$color',
});

const EmptyStateDescription = styled(TParagraph, {
  fontSize: '$4',
  color: '$glassTextMuted',
  maxWidth: 440,
  textAlign: 'center',
});

const SearchContainer = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  backgroundColor: '$glassSurface',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$glassBorder',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  animation: 'quick',
  hoverStyle: {
    borderColor: withAlpha(BRAND_NAVY, 0.5),
  },
});

const NoticeCard = styled(YStack, {
  backgroundColor: withAlpha(BRAND_NAVY, 0.14),
  borderRadius: '$6',
  padding: '$5',
  borderWidth: 1,
  borderColor: withAlpha(BRAND_NAVY, 0.35),
  gap: '$3',
  animation: 'medium',
  enterStyle: { opacity: 0, y: 10 },
});

/* ─── Component ─── */

export function FootballLandingPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = React.useState('');

  const {
    data,
    loading: isLoading,
    error,
    refetch,
  } = useGetUserLeaguesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

  // Filter to football leagues only (null sport = legacy baseball league)
  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        .filter((l) => l.sport === Sport.Football),
    [data?.userLeagues],
  );

  const leaguesCount = leagues.length;
  const hasLeagues = leaguesCount > 0;
  const userName = formatDisplayName(auth?.user?.username || 'Manager');
  const currentYear = new Date().getFullYear();

  const heroSubtitleCopy = hasLeagues
    ? `You're managing ${leaguesCount} football league${
        leaguesCount === 1 ? '' : 's'
      }. Track your roster, monitor matchups, and prepare for gameday.`
    : 'Launch your first fantasy football league in minutes — snake or auction drafts, DST or IDP, and full season management.';

  const quickWins = hasLeagues
    ? [
        'Check your starting lineup before Sunday kickoff.',
        'Monitor waiver wire adds and drops mid-week.',
        'Share invite codes to fill open roster spots.',
      ]
    : [
        'Choose between D/ST or IDP (individual defensive players).',
        'Set your draft date and invite managers to lock in.',
        'Pick snake or auction — both are fully supported.',
      ];

  const pageBackgroundStyle = React.useMemo(
    () => ({
      background: `
        radial-gradient(ellipse at 10% 15%, ${withAlpha(BRAND_NAVY, 0.28)} 0%, transparent 50%),
        radial-gradient(ellipse at 90% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, ${withAlpha(BRAND_NAVY, 0.08)} 0%, transparent 60%),
        radial-gradient(ellipse at 15% 85%, ${withAlpha(BRAND_GOLD, 0.1)} 0%, transparent 50%),
        linear-gradient(180deg, ${withAlpha(BG_DARK, 0.95)} 0%, hsl(var(--background)) 100%)
      `,
      backgroundAttachment: 'fixed',
    }),
    [],
  );

  const handleViewLeague = (leagueId: number) => {
    navigate(`/football/league/${leagueId}`);
  };

  const handleCreateLeague = () => {
    navigate('/football/league/create');
  };

  const handleBrowseLeagues = () => {
    navigate('/football/leagues');
  };

  const filteredLeagues = leagues.filter((l) =>
    (l?.name || '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (auth.isLoading || (!!auth.user && (isLoading || (!data && !error)))) {
    return (
      <PageContainer
        aria-label="Football fantasy landing page"
        style={pageBackgroundStyle}
      >
        <ContentContainer>
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            minHeight="60vh"
          >
            <Spinner size="large" color={BRAND_NAVY_LIGHT} />
          </YStack>
        </ContentContainer>
      </PageContainer>
    );
  }

  /* ─── Full hero for first-time football users ─── */
  const fullHero = (
    <HeroSection
      role="region"
      aria-labelledby="football-hero-title"
      style={{
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 50%, ${SURFACE_CARD} 100%)`,
        boxShadow: `0 8px 32px ${withAlpha(BRAND_NAVY, 0.18)}, inset 0 1px 0 ${withAlpha(WHITE, 0.05)}`,
      }}
    >
      <HeroContent>
        <HeroBadge>
          <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
            <span role="img" aria-label="football">
              🏈
            </span>{' '}
            {currentYear} Season Hub
          </Text>
        </HeroBadge>
        <HeroTitle id="football-hero-title">Football Fantasy</HeroTitle>
        <HeroSubtitle>
          {`Welcome back, ${userName}. ${heroSubtitleCopy}`}
        </HeroSubtitle>
        <ActionButtonsRow marginTop="$3">
          <PrimaryButton
            onPress={handleCreateLeague}
            accessibilityLabel="Create a new football league"
            data-testid="create-league-button"
          >
            <Text fontWeight="700">Create League</Text>
          </PrimaryButton>
          <SecondaryButton
            onPress={handleBrowseLeagues}
            accessibilityLabel="Browse public football leagues"
          >
            <Text fontWeight="700">Browse Leagues</Text>
          </SecondaryButton>
        </ActionButtonsRow>
        <Paragraph fontSize="$3" color="$glassTextMuted" maxWidth={440}>
          Full season management — draft tools, weekly matchups, waiver wire,
          and live scoring built for competitive fantasy managers.
        </Paragraph>
      </HeroContent>

      <HeroSidePanel>
        <SideCard
          style={{
            background: `linear-gradient(160deg, ${BG_DARK} 0%, ${SURFACE_PANEL} 100%)`,
          }}
        >
          <YStack gap="$1">
            <Paragraph
              fontSize="$3"
              color="$glassTextMuted"
              textTransform="uppercase"
              letterSpacing={1}
            >
              Getting Started
            </Paragraph>
            <H3 size="$7" color="$color">
              Build your first roster
            </H3>
          </YStack>
          <Paragraph fontSize="$3" color="$glassTextSubdued">
            Create or join a league to start tracking your season — weekly
            matchups, roster stats, and draft countdowns will appear here.
          </Paragraph>
        </SideCard>

        <QuickGlanceCard
          style={{
            background: `linear-gradient(160deg, ${SURFACE_PANEL} 0%, ${BG_DARK} 100%)`,
          }}
        >
          <Paragraph
            fontSize="$3"
            color="$glassTextMuted"
            textTransform="uppercase"
            letterSpacing={1}
          >
            Quick Wins
          </Paragraph>
          <Paragraph fontSize="$4" color="$color">
            Make sure your league is ready before the first kickoff.
          </Paragraph>
          {quickWins.map((item, index) => (
            <QuickGlanceRow key={index}>
              <QuickGlanceDot />
              <Paragraph fontSize="$3" color="$glassTextSubdued">
                {item}
              </Paragraph>
            </QuickGlanceRow>
          ))}
        </QuickGlanceCard>
      </HeroSidePanel>
    </HeroSection>
  );

  /* ─── Compact hero for returning users ─── */
  const compactHero = (
    <CompactHeroBanner
      role="region"
      aria-labelledby="football-hero-title"
      style={{
        background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 50%, ${SURFACE_CARD} 100%)`,
        boxShadow: `0 4px 20px ${withAlpha(BRAND_NAVY, 0.14)}, inset 0 1px 0 ${withAlpha(WHITE, 0.04)}`,
      }}
    >
      <CompactHeroLeft>
        <CompactTitle id="football-hero-title">
          <span role="img" aria-label="football">
            🏈
          </span>{' '}
          Football Fantasy
        </CompactTitle>
        <CompactWelcome>Welcome back, {userName}</CompactWelcome>
      </CompactHeroLeft>
      <CompactActions>
        <CompactPrimaryButton
          onPress={handleCreateLeague}
          accessibilityLabel="Create a new football league"
          data-testid="create-league-button"
        >
          <Text fontWeight="700">+ Create</Text>
        </CompactPrimaryButton>
        <CompactButton
          onPress={handleBrowseLeagues}
          accessibilityLabel="Browse public football leagues"
        >
          <Text fontWeight="700">Browse</Text>
        </CompactButton>
      </CompactActions>
    </CompactHeroBanner>
  );

  return (
    <PageContainer
      aria-label="Football fantasy landing page"
      style={pageBackgroundStyle}
    >
      <PageMeta
        title="Football"
        description="Manage your fantasy football leagues, draft players, track live stats, and compete with friends on Legacy Sports."
      />
      <ContentContainer>
        {hasLeagues ? compactHero : fullHero}

        {error && (
          <NoticeCard
            borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.08)}
            role="alert"
            aria-live="assertive"
          >
            <XStack alignItems="center" justifyContent="space-between" gap="$4">
              <YStack gap="$1" flex={1}>
                <Paragraph fontSize="$4" color="$red10" fontWeight="600">
                  Could not load your leagues
                </Paragraph>
                <Paragraph fontSize="$3" color="$glassTextSubdued">
                  There was a problem fetching your league data. You can still
                  create or join a league below.
                </Paragraph>
              </YStack>
              <SecondaryButton
                onPress={() => void refetch()}
                accessibilityLabel="Retry loading leagues"
              >
                <Text fontWeight="700">Retry</Text>
              </SecondaryButton>
            </XStack>
          </NoticeCard>
        )}

        {!auth?.user && (
          <NoticeCard>
            <Paragraph fontSize="$4" color={BRAND_GOLD_LIGHT} fontWeight="600">
              Sign in to manage your fantasy football leagues
            </Paragraph>
            <Paragraph fontSize="$3" color={BRAND_GOLD_LIGHT}>
              Authentication is required to access drafts, invite codes, and
              lineup management.
            </Paragraph>
            <PrimaryButton
              onPress={() => navigate('/')}
              accessibilityLabel="Get started free"
            >
              <Text fontWeight="700">Get Started Free</Text>
            </PrimaryButton>
          </NoticeCard>
        )}

        <LeaguesSection
          role="region"
          aria-labelledby="your-football-leagues-title"
        >
          <SectionHeader>
            <YStack gap="$2">
              <SectionTitle id="your-football-leagues-title">
                Your Leagues
              </SectionTitle>
              <SectionDescription>
                {hasLeagues
                  ? 'Select a league to review rosters, matchups, and draft plans.'
                  : 'Create or join a football league to unlock your personalized season dashboard.'}
              </SectionDescription>
            </YStack>
            {hasLeagues && (
              <YStack gap="$2" width="100%" maxWidth={340}>
                <label htmlFor="football-league-search" className="sr-only">
                  Search leagues
                </label>
                <SearchContainer role="search">
                  <Input
                    id="football-league-search"
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

          {isLoading && !data ? (
            <YStack
              alignItems="center"
              justifyContent="center"
              minHeight={240}
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <Paragraph fontSize="$5" color="$color11">
                Loading your leagues...
              </Paragraph>
            </YStack>
          ) : error && !data ? null : filteredLeagues.length > 0 ? (
            <LeaguesList data-testid="leagues-list">
              {filteredLeagues.map((league) => {
                const statusColors = getDraftStatusColors(league?.draftStatus);

                return (
                  <LeagueRowOuter
                    key={league.id ?? `league-${league.name}`}
                    onPress={() => league.id && handleViewLeague(league.id)}
                    accessibilityLabel={`View ${league?.name || 'league'}`}
                    role="link"
                    aria-label={`View ${league?.name || 'league'}`}
                    style={{
                      background: `linear-gradient(135deg, ${BG_DARK} 0%, ${SURFACE_PANEL} 100%)`,
                    }}
                  >
                    {/* League identity */}
                    <YStack gap="$1" flex={1} minWidth={180}>
                      <H3 fontSize="$6" fontWeight="700" color="$color">
                        {league?.name || 'Unnamed League'}
                      </H3>
                      <Paragraph fontSize="$2" color="$textMuted">
                        {league?.maxRosterSize
                          ? `${league.maxRosterSize}-slot roster`
                          : 'Season dashboard'}
                      </Paragraph>
                    </YStack>

                    {/* Status indicators */}
                    <LeagueRowMeta>
                      {/* Sport badge */}
                      <SportBadge>
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          color={BRAND_GOLD_LIGHT}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          <span role="img" aria-label="football">
                            🏈
                          </span>{' '}
                          Football
                        </Text>
                      </SportBadge>

                      {/* Draft / season status */}
                      <DraftBadge
                        backgroundColor={statusColors.bg}
                        borderColor={statusColors.border}
                      >
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          color={statusColors.text}
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          {league?.draftStatus === 'not-started' ||
                          league?.draftStatus === 'queued'
                            ? 'Draft Pending'
                            : formatDraftStatusForCard(league?.draftStatus)}
                        </Text>
                      </DraftBadge>

                      {league?.weekAdvanceStatus === 'processing' ||
                      league?.weekAdvanceStatus === 'queued' ? (
                        <WeekStatusChip
                          backgroundColor={withAlpha(YELLOW, 0.12)}
                          borderColor={withAlpha(YELLOW, 0.35)}
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
                      ) : league?.weekAdvanceStatus === 'failed' ? (
                        <WeekStatusChip
                          backgroundColor={withAlpha(INJURY_OUT, 0.12)}
                          borderColor={withAlpha(INJURY_OUT, 0.35)}
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
                      onPress={(e: GestureResponderEvent) => {
                        e.stopPropagation();
                        if (league?.id) handleViewLeague(league.id);
                      }}
                      accessibilityLabel={`View ${league?.name || 'league'}`}
                    >
                      <Text
                        fontWeight="700"
                        color={BRAND_GOLD_LIGHT}
                        fontSize="$2"
                      >
                        View
                      </Text>
                    </ViewLeagueButton>
                  </LeagueRowOuter>
                );
              })}
            </LeaguesList>
          ) : (
            <EmptyState
              data-testid="football-empty-state"
              style={{
                background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 100%)`,
              }}
            >
              <EmptyStateIcon>
                <Text aria-hidden="true">🏈</Text>
              </EmptyStateIcon>
              {search.trim() ? (
                <>
                  <EmptyStateTitle>
                    No leagues match your search
                  </EmptyStateTitle>
                  <EmptyStateDescription>
                    Try a different search term or clear the search field.
                  </EmptyStateDescription>
                </>
              ) : (
                <>
                  <EmptyStateTitle>No football leagues yet</EmptyStateTitle>
                  <EmptyStateDescription>
                    Create your first football league and invite friends to
                    compete — draft tools, weekly matchups, and live scoring
                    included.
                  </EmptyStateDescription>
                  <ActionButtonsRow justifyContent="center">
                    <PrimaryButton
                      onPress={handleCreateLeague}
                      data-testid="create-first-league-button"
                    >
                      <Text fontWeight="700">
                        Create your first football league
                      </Text>
                    </PrimaryButton>
                    <SecondaryButton onPress={handleBrowseLeagues}>
                      <Text fontWeight="700">Browse leagues</Text>
                    </SecondaryButton>
                  </ActionButtonsRow>
                </>
              )}
            </EmptyState>
          )}
        </LeaguesSection>
      </ContentContainer>
    </PageContainer>
  );
}
