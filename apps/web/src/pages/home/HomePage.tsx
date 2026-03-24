import React, { useEffect, useMemo, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
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
import {
  ScrollView,
  Separator,
  Spinner,
  styled,
  Text,
  H2 as TH2,
} from 'tamagui';
import { OnboardingTutorial } from '../../components/onboarding';
import {
  BrandIcon,
  BrandIconBadge,
  type BrandIconName,
} from '../../components/icons';
import { PageMeta } from '../../components/PageMeta';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';
import { OnThisDayFeed } from '../../features/baseball';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN_DEEP,
  withAlpha,
} from '../../constants/colors';

/* ─── Constants ─── */

const CREATE_BASEBALL_LEAGUE_ROUTE = '/baseball/league/create';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$8',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$4',
  gap: '$8',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$6',
  },
});

const HeroSection = styled(YStack, {
  position: 'relative',
  overflow: 'hidden',
  paddingVertical: '$10',
  paddingHorizontal: '$6',
  alignItems: 'center',
  gap: '$5',
  $sm: {
    paddingVertical: '$7',
    paddingHorizontal: '$4',
  },
});

const HeroBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
  animation: 'medium',
  enterStyle: { opacity: 0, y: -10 },
});

const SportCard = styled(YStack, {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$6',
  gap: '$4',
  cursor: 'pointer',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-4px)',
  },
  pressStyle: {
    scale: 0.98,
    borderColor: '$borderColorFocus',
  },
  $sm: {
    padding: '$4',
  },
});

const SportIcon = styled(YStack, {
  width: 56,
  height: 56,
  borderRadius: '$5',
  alignItems: 'center',
  justifyContent: 'center',
});

const FeatureCard = styled(YStack, {
  flex: 1,
  minWidth: 220,
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$5',
  gap: '$3',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  $sm: {
    minWidth: '100%',
    padding: '$4',
  },
});

const FeatureIconCircle = styled(YStack, {
  width: 44,
  height: 44,
  borderRadius: 9999,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
});

const ActionButton = styled(Button, {
  borderRadius: '$6',
  height: '$5',
  fontSize: '$3',
  fontWeight: '700',
  paddingHorizontal: '$5',
  backgroundColor: BRAND_NAVY_LIGHT,
  color: '$color1',
  borderColor: 'transparent',
  hoverStyle: {
    backgroundColor: BRAND_NAVY,
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: BRAND_NAVY_DARK,
  },
});

const OutlineButton = styled(Button, {
  borderRadius: '$6',
  height: '$5',
  fontSize: '$3',
  fontWeight: '700',
  paddingHorizontal: '$5',
  backgroundColor: '$surfaceInteractive',
  borderColor: '$accentMuted',
  borderWidth: 1,
  color: BRAND_GOLD_LIGHT,
  hoverStyle: {
    backgroundColor: '$accentMuted',
    borderColor: '$borderColorFocus',
  },
  pressStyle: {
    backgroundColor: '$accentMuted',
  },
});

const SectionTitle = styled(TH2, {
  fontSize: '$9',
  fontWeight: '700',
  color: '$color',
});

const DashboardCard = styled(YStack, {
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$5',
  gap: '$3',
  cursor: 'pointer',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  pressStyle: {
    scale: 0.98,
  },
  $sm: {
    padding: '$4',
  },
});

const StatBox = styled(YStack, {
  alignItems: 'center',
  gap: '$1',
  flex: 1,
  minWidth: 80,
});

/* ─── Page Background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 50%),
    radial-gradient(ellipse at 80% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 90%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%)
  `,
  backgroundAttachment: 'fixed',
};

const heroGradientStyle: React.CSSProperties = {
  background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.15)} 0%, transparent 70%)`,
};

const sportCardGlassStyle = (accentColor: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${accentColor} 100%)`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
});

const featureCardGlassStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.72)} 0%, ${withAlpha(BRAND_NAVY, 0.35)} 100%)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

/* ─── Sport Config ─── */

interface SportConfig {
  key: string;
  icon: BrandIconName;
  title: string;
  description: string;
  route: string;
  accent: string;
  available: boolean;
}

const SPORTS: SportConfig[] = [
  {
    key: 'baseball',
    icon: 'baseball',
    title: 'Baseball',
    description:
      'Build your roster, dominate the draft, and track real-time stats across every matchup.',
    route: '/baseball',
    accent: withAlpha(BRAND_NAVY, 0.55),
    available: true,
  },
  {
    key: 'football',
    icon: 'football',
    title: 'Football',
    description:
      'Manage lineups, trade players, and lead your team through every game week.',
    route: '/football',
    accent: withAlpha(GREEN_DEEP, 0.35),
    available: false,
  },
];

const FEATURES = [
  {
    icon: 'stats' as const,
    label: 'stats',
    title: 'Live Stats',
    description:
      'Real-time player statistics, projections, and performance trends.',
  },
  {
    icon: 'draft' as const,
    label: 'draft',
    title: 'Draft Tools',
    description:
      'Snake and auction drafts with smart rankings and position analysis.',
  },
  {
    icon: 'live' as const,
    label: 'realtime',
    title: 'Instant Updates',
    description:
      'WebSocket-powered live scoring and lineup lock notifications.',
  },
  {
    icon: 'secure' as const,
    label: 'secure',
    title: 'Secure Leagues',
    description:
      'Private invite codes, commissioner controls, and fair waiver rules.',
  },
];

/**
 * Home Page — Landing page for the web application.
 *
 * Modernized with gradient backgrounds, glassmorphism cards,
 * and entrance animations for a polished user experience.
 */
const PREFS_STORAGE_KEY = 'ls_user_preferences';

function readDefaultSport(): 'baseball' | 'football' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'baseball';
    const parsed = JSON.parse(raw) as { defaultSport?: string };
    return parsed.defaultSport === 'football' ? 'football' : 'baseball';
  } catch {
    return 'baseball';
  }
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth?.user?.id;
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const defaultSport = useMemo(() => readDefaultSport(), []);
  const orderedSports = useMemo(
    () =>
      defaultSport === 'baseball'
        ? SPORTS
        : [...SPORTS].sort((a) => (a.key === defaultSport ? -1 : 1)),
    [defaultSport],
  );
  const primarySport = orderedSports[0];
  const defaultSportRoute = primarySport.route;

  const {
    data: leagueData,
    loading: leaguesLoading,
    error: leaguesError,
    refetch: refetchLeagues,
  } = useGetUserLeaguesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

  const leagues = leagueData?.userLeagues ?? [];
  const hasLeagues = leagues.length > 0;
  const userName = auth?.user?.username || 'Manager';

  const upcomingDrafts = leagues.filter((l) =>
    l.draftStatus
      ? ['not-started', 'queued', 'scheduled'].includes(l.draftStatus)
      : false,
  ).length;

  // Auto-show tutorial once per user for first-time visitors who have no leagues.
  // Key is scoped to the user ID so each user gets their own tutorial state.
  const getOnboardingKey = (uid: number) => `ls_onboarding_complete_${uid}`;

  useEffect(() => {
    if (!userId) return;
    if (!hasLeagues && !leaguesLoading) {
      const key = getOnboardingKey(userId);
      try {
        // Migrate previously-onboarded users from the legacy global key so they
        // don't see the tutorial again after upgrading to the per-user key.
        const legacyDone = window.localStorage.getItem(
          'ls_onboarding_complete',
        );
        if (legacyDone !== null && (JSON.parse(legacyDone) as boolean)) {
          window.localStorage.setItem(key, JSON.stringify(true));
          window.localStorage.removeItem('ls_onboarding_complete');
          return;
        }
        const stored = window.localStorage.getItem(key);
        const completed =
          stored !== null ? (JSON.parse(stored) as boolean) : false;
        if (!completed) {
          setTutorialOpen(true);
        }
      } catch {
        setTutorialOpen(true);
      }
    }
  }, [userId, hasLeagues, leaguesLoading]);

  const handleTutorialClose = () => {
    setTutorialOpen(false);
    if (userId) {
      try {
        window.localStorage.setItem(
          getOnboardingKey(userId),
          JSON.stringify(true),
        );
      } catch {
        // ignore
      }
    }
  };

  /* ─── Loading state — prevents unauthenticated hero flash ─── */
  if (auth.isLoading || (!!auth.user && leaguesLoading)) {
    return (
      <ScrollView>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            minHeight="60vh"
          >
            <Spinner size="large" color="$brandGoldLight" />
          </YStack>
        </PageContainer>
      </ScrollView>
    );
  }

  /* ─── Error state: league query failed with no usable cached data ─── */
  if (leaguesError && !leaguesLoading && !leagueData?.userLeagues) {
    return (
      <ScrollView>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            gap="$4"
            padding="$8"
            minHeight="60vh"
          >
            <Text fontSize="$8">
              <span role="img" aria-label="warning">
                ⚠️
              </span>
            </Text>
            <H2
              fontSize="$8"
              fontWeight="700"
              color="$color"
              textAlign="center"
            >
              Unable to load your leagues
            </H2>
            <Paragraph
              fontSize="$4"
              color="$textMuted"
              textAlign="center"
              maxWidth={480}
            >
              Something went wrong while fetching your leagues. Please try
              again.
            </Paragraph>
            <Button
              backgroundColor="$brandNavyLight"
              color="$textOnAccent"
              pressStyle={{ backgroundColor: '$brandNavyDark' }}
              hoverStyle={{ backgroundColor: '$brandNavy' }}
              onPress={() => void refetchLeagues()}
            >
              Retry
            </Button>
          </YStack>
        </PageContainer>
      </ScrollView>
    );
  }

  /* ─── Personalized dashboard for returning users ─── */
  if (hasLeagues) {
    return (
      <ScrollView>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          {/* ─── Welcome Hero ─── */}
          <HeroSection style={heroGradientStyle}>
            <HeroBadge>
              <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                {new Date().getFullYear()} Season
              </Text>
            </HeroBadge>

            <H1
              fontSize="$12"
              fontWeight="800"
              color="$color"
              textAlign="center"
              letterSpacing={-0.5}
              animation="medium"
              enterStyle={{ opacity: 0, y: 20 }}
              $sm={{ fontSize: '$10' }}
            >
              Welcome back, {userName}
            </H1>

            <Paragraph
              fontSize="$6"
              color="$textMuted"
              textAlign="center"
              maxWidth={560}
              lineHeight="$7"
              animation="medium"
              enterStyle={{ opacity: 0, y: 15 }}
            >
              You&apos;re managing {leagues.length}{' '}
              {leagues.length === 1 ? 'league' : 'leagues'}. Jump into your
              season dashboard to check matchups, rosters, and drafts.
            </Paragraph>

            <XStack
              gap="$3"
              marginTop="$2"
              flexWrap="wrap"
              justifyContent="center"
              animation="medium"
              enterStyle={{ opacity: 0, y: 10 }}
            >
              <ActionButton
                onPress={() => {
                  navigate(defaultSportRoute);
                }}
                accessibilityLabel={`Go to ${defaultSport} dashboard`}
              >
                <Text fontWeight="700">My Dashboard</Text>
              </ActionButton>
              <OutlineButton
                onPress={() => {
                  navigate('/players/stats');
                }}
                accessibilityLabel="Browse player statistics"
              >
                <Text fontWeight="700">Browse Stats</Text>
              </OutlineButton>
              <OutlineButton
                onPress={() => {
                  navigate('/preferences');
                }}
                accessibilityLabel="Open preferences"
              >
                <XStack alignItems="center" gap="$2">
                  <BrandIcon name="settings" size={16} />
                  <Text fontWeight="700">Preferences</Text>
                </XStack>
              </OutlineButton>
            </XStack>
          </HeroSection>

          <ContentContainer>
            {/* ─── Season Snapshot ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Season Snapshot</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  A quick look at where things stand across your leagues.
                </Paragraph>
              </YStack>

              <XStack
                gap="$4"
                flexWrap="wrap"
                borderRadius="$7"
                borderWidth={1}
                borderColor="$glassBorder"
                padding="$5"
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.72)} 0%, ${withAlpha(BRAND_NAVY, 0.35)} 100%)`,
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
              >
                <StatBox>
                  <Text fontSize="$9" fontWeight="800" color={BRAND_GOLD_LIGHT}>
                    {leagues.length}
                  </Text>
                  <Text fontSize="$2" color="$textMuted" fontWeight="600">
                    Active Leagues
                  </Text>
                </StatBox>
                <StatBox>
                  <Text fontSize="$9" fontWeight="800" color={BRAND_GOLD_LIGHT}>
                    {upcomingDrafts}
                  </Text>
                  <Text fontSize="$2" color="$textMuted" fontWeight="600">
                    Upcoming Drafts
                  </Text>
                </StatBox>
              </XStack>
            </YStack>

            {/* ─── Your Leagues ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Your Leagues</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Jump into a league to manage rosters, review matchups, and
                  prep for drafts.
                </Paragraph>
              </YStack>

              <XStack gap="$4" flexWrap="wrap">
                {leagues.map((league) => (
                  <DashboardCard
                    key={league.id}
                    flex={1}
                    minWidth={280}
                    style={{
                      background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${withAlpha(BRAND_NAVY, 0.55)} 100%)`,
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                    }}
                    onPress={() => {
                      navigate(`/baseball/league/${league.id}`);
                    }}
                    accessibilityLabel={`View league ${league.name}`}
                  >
                    <H3 fontSize="$6" fontWeight="700" color="$color">
                      {league.name}
                    </H3>
                    <XStack gap="$4">
                      {league.currentWeekNumber != null && (
                        <Text fontSize="$3" color="$textMuted">
                          Week {league.currentWeekNumber}
                        </Text>
                      )}
                      {league.draftStatus && (
                        <Text fontSize="$3" color={BRAND_GOLD_LIGHT}>
                          Draft:{' '}
                          {league.draftStatus === 'completed'
                            ? 'Done'
                            : league.draftStatus}
                        </Text>
                      )}
                    </XStack>
                  </DashboardCard>
                ))}
              </XStack>
            </YStack>

            <Separator backgroundColor="$glassBorder" />

            {/* ─── Sports Navigation ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Your Sports</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Navigate to a sport dashboard to manage leagues and track
                  stats.
                </Paragraph>
              </YStack>

              <XStack gap="$5" flexWrap="wrap">
                {SPORTS.map((sport) => (
                  <SportCard
                    key={sport.key}
                    flex={1}
                    minWidth={300}
                    style={sportCardGlassStyle(sport.accent)}
                    onPress={() => {
                      navigate(sport.route);
                    }}
                    accessibilityLabel={`Navigate to ${sport.title}`}
                    role="link"
                  >
                    <XStack gap="$4" alignItems="center">
                      <SportIcon
                        style={{
                          background: `linear-gradient(135deg, ${sport.accent}, ${withAlpha(BRAND_NAVY_LIGHT, 0.08)})`,
                        }}
                      >
                        <BrandIcon
                          name={sport.icon}
                          size={28}
                          title={sport.title}
                          decorative={false}
                        />
                      </SportIcon>
                      <YStack gap="$1" flex={1}>
                        <H3 fontSize="$8" fontWeight="700" color="$color">
                          {sport.title}
                        </H3>
                      </YStack>
                    </XStack>
                    <Paragraph
                      fontSize="$4"
                      color="$glassTextSubdued"
                      lineHeight="$5"
                    >
                      {sport.description}
                    </Paragraph>
                  </SportCard>
                ))}
              </XStack>
            </YStack>

            {/* ─── On This Day ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>On This Day in Baseball</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={500}>
                  Historic performances from today&apos;s date across every
                  season in the database.
                </Paragraph>
              </YStack>
              <OnThisDayFeed />
            </YStack>
          </ContentContainer>
        </PageContainer>
      </ScrollView>
    );
  }

  /* ─── Getting-started page for new users (no leagues yet) ─── */
  return (
    <>
      {tutorialOpen && <OnboardingTutorial onClose={handleTutorialClose} />}
      <ScrollView>
        <PageMeta
          title="Fantasy Baseball League Manager"
          description="Manage your fantasy baseball leagues, draft players, track live stats, and compete with friends on Legacy Sports."
        />
        <PageContainer style={pageBackgroundStyle}>
          {/* ─── Hero ─── */}
          <HeroSection style={heroGradientStyle}>
            <HeroBadge>
              <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                {new Date().getFullYear()} Season
              </Text>
            </HeroBadge>

            <H1
              fontSize="$12"
              fontWeight="800"
              color="$color"
              textAlign="center"
              letterSpacing={-0.5}
              animation="medium"
              enterStyle={{ opacity: 0, y: 20 }}
              $sm={{ fontSize: '$10' }}
            >
              Welcome, {userName}
            </H1>

            <Paragraph
              fontSize="$6"
              color="$textMuted"
              textAlign="center"
              maxWidth={560}
              lineHeight="$7"
              animation="medium"
              enterStyle={{ opacity: 0, y: 15 }}
            >
              Create or join your first league. Draft legends from across MLB
              history, compete on real archived statistics, and build your
              all-time dynasty.
            </Paragraph>

            <XStack
              gap="$3"
              marginTop="$2"
              flexWrap="wrap"
              justifyContent="center"
              animation="medium"
              enterStyle={{ opacity: 0, y: 10 }}
            >
              <ActionButton
                onPress={() => {
                  navigate(CREATE_BASEBALL_LEAGUE_ROUTE);
                }}
                accessibilityLabel="Create a new baseball league"
              >
                <Text fontWeight="700">Create a League</Text>
              </ActionButton>
              <OutlineButton
                onPress={() => {
                  navigate('/baseball/league/join');
                }}
                accessibilityLabel="Join an existing league with an invite code"
              >
                <Text fontWeight="700">Join a League</Text>
              </OutlineButton>
              <OutlineButton
                onPress={() => {
                  navigate('/players/stats');
                }}
                accessibilityLabel="Browse player statistics"
              >
                <Text fontWeight="700">Browse Stats</Text>
              </OutlineButton>
              <OutlineButton
                onPress={() => setTutorialOpen(true)}
                accessibilityLabel="How historical stats work — open tutorial"
              >
                <XStack alignItems="center" gap="$2">
                  <BrandIcon name="book" size={16} />
                  <Text fontWeight="700">How It Works</Text>
                </XStack>
              </OutlineButton>
            </XStack>
          </HeroSection>

          <ContentContainer>
            {/* ─── Sports ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Choose Your Sport</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Jump into a sport to manage leagues, run drafts, and track
                  your teams.
                </Paragraph>
              </YStack>

              <XStack gap="$5" flexWrap="wrap">
                {orderedSports.map((sport) => (
                  <SportCard
                    key={sport.key}
                    flex={1}
                    minWidth={300}
                    style={sportCardGlassStyle(sport.accent)}
                    {...(sport.available
                      ? {
                          onPress: () => {
                            navigate(sport.route);
                          },
                          role: 'link' as const,
                        }
                      : {})}
                    opacity={sport.available ? 1 : 0.6}
                    cursor={sport.available ? 'pointer' : 'default'}
                    accessibilityLabel={
                      sport.available
                        ? `Navigate to ${sport.title}`
                        : `${sport.title} — Coming Soon`
                    }
                  >
                    <XStack gap="$4" alignItems="center">
                      <SportIcon
                        style={{
                          background: `linear-gradient(135deg, ${sport.accent}, ${withAlpha(BRAND_NAVY_LIGHT, 0.08)})`,
                        }}
                      >
                        <BrandIcon
                          name={sport.icon}
                          size={28}
                          title={sport.title}
                          decorative={false}
                        />
                      </SportIcon>
                      <YStack gap="$1" flex={1}>
                        <H3 fontSize="$8" fontWeight="700" color="$color">
                          {sport.title}
                        </H3>
                        {!sport.available && (
                          <Text
                            fontSize="$2"
                            color="$amber9"
                            fontWeight="600"
                            textTransform="uppercase"
                            letterSpacing={0.5}
                          >
                            Coming Soon
                          </Text>
                        )}
                      </YStack>
                    </XStack>

                    <Paragraph
                      fontSize="$4"
                      color="$glassTextSubdued"
                      lineHeight="$5"
                    >
                      {sport.description}
                    </Paragraph>

                    {sport.available && (
                      <XStack gap="$3" marginTop="$1">
                        <ActionButton
                          size="$3"
                          onPress={(e: GestureResponderEvent) => {
                            e.stopPropagation();
                            navigate(sport.route);
                          }}
                        >
                          <Text fontWeight="700">View Leagues</Text>
                        </ActionButton>
                        {sport.key === 'baseball' && (
                          <OutlineButton
                            size="$3"
                            onPress={(e: GestureResponderEvent) => {
                              e.stopPropagation();
                              navigate(CREATE_BASEBALL_LEAGUE_ROUTE);
                            }}
                          >
                            <Text fontWeight="700">Create League</Text>
                          </OutlineButton>
                        )}
                      </XStack>
                    )}
                  </SportCard>
                ))}
              </XStack>
            </YStack>

            <Separator backgroundColor="$glassBorder" />

            {/* ─── Features ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Platform Features</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Everything you need to run a competitive fantasy league.
                </Paragraph>
              </YStack>

              <XStack gap="$4" flexWrap="wrap">
                {FEATURES.map((feature) => (
                  <FeatureCard
                    key={feature.label}
                    style={featureCardGlassStyle}
                  >
                    <FeatureIconCircle>
                      <BrandIcon
                        name={feature.icon}
                        size={22}
                        title={feature.title}
                        decorative={false}
                      />
                    </FeatureIconCircle>
                    <H3 fontSize="$6" fontWeight="700" color="$color">
                      {feature.title}
                    </H3>
                    <Paragraph
                      fontSize="$3"
                      color="$glassTextSubdued"
                      lineHeight="$4"
                    >
                      {feature.description}
                    </Paragraph>
                  </FeatureCard>
                ))}
              </XStack>
            </YStack>

            {/* ─── On This Day (baseball-only) ─── */}
            {defaultSport === 'baseball' && (
              <YStack gap="$5">
                <YStack gap="$2">
                  <SectionTitle>On This Day in Baseball</SectionTitle>
                  <Paragraph fontSize="$4" color="$textMuted" maxWidth={500}>
                    Historic performances from today's date across every season
                    in the database — see which players you manage made history.
                  </Paragraph>
                </YStack>
                <OnThisDayFeed />
              </YStack>
            )}

            {/* ─── Stats CTA ─── */}
            <YStack
              borderRadius="$7"
              borderWidth={1}
              borderColor="$glassBorder"
              padding="$7"
              gap="$4"
              alignItems="center"
              animation="medium"
              hoverStyle={{
                borderColor: '$glassBorderHover',
              }}
              style={{
                background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.25)} 0%, ${withAlpha(BG_DARK, 0.85)} 100%)`,
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              <BrandIconBadge
                name="stats"
                size={56}
                iconSize={28}
                title="Player statistics"
                decorative={false}
                rounded="square"
              />
              <H2
                fontSize="$8"
                fontWeight="700"
                color="$color"
                textAlign="center"
              >
                Explore Player Statistics
              </H2>
              <Paragraph
                fontSize="$4"
                color="$textMuted"
                textAlign="center"
                maxWidth={500}
              >
                Dive into batting averages, ERA, touchdowns, and more. Make
                data-driven decisions for your next trade or waiver pickup.
              </Paragraph>
              <ActionButton
                marginTop="$2"
                onPress={() => {
                  navigate('/players/stats');
                }}
              >
                <Text fontWeight="700">View All Stats</Text>
              </ActionButton>
            </YStack>
          </ContentContainer>
        </PageContainer>
      </ScrollView>
    </>
  );
}

export default HomePage;
