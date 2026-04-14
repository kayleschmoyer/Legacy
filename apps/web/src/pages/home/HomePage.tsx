import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { ScrollView, Spinner, styled, Text, H2 as TH2 } from 'tamagui';
import { OnThisDayFeed } from '@legacy-sports/shared-components/leagues';
import { formatDraftDate } from '@legacy-sports/utils';
import { formatDraftStatusForCard } from '@legacy-sports/shared-components/utils';
import { formatDisplayName } from '../../lib/formatDisplayName';
import { OnboardingTutorial } from '../../components/onboarding';
import {
  BrandIcon,
  BrandIconBadge,
  type BrandIconName,
} from '../../components/icons';
import { PageMeta } from '../../components/PageMeta';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetUserLeagueSummariesQuery,
  type UserLeagueSummaryFragment,
} from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BG_LIGHT,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN,
  GREEN_DEEP,
  GREEN_LIGHTER,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';

/* ─── Constants ─── */

const CREATE_BASEBALL_LEAGUE_ROUTE = '/baseball/league/create';

/* ─── Urgency sort ─── */

/**
 * Returns a numeric urgency key for sorting league summaries.
 * Lower = more urgent / shown first.
 *   0 – live draft
 *   1 – active season
 *   2 – pre-draft
 *   3 – everything else
 */
function urgencyKey(s: UserLeagueSummaryFragment): number {
  if (s.draftStatus === 'in-progress') return 0;
  if (s.leaguePhase === 'active') return 1;
  if (s.leaguePhase === 'pre-draft') return 2;
  return 3;
}

function sortByUrgency(
  summaries: UserLeagueSummaryFragment[],
): UserLeagueSummaryFragment[] {
  return [...summaries].sort((a, b) => urgencyKey(a) - urgencyKey(b));
}

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

/* ─── League Summary Card ─── */

const LeagueSummaryCard = styled(YStack, {
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
  cursor: 'pointer',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  pressStyle: {
    scale: 0.98,
  },
});

interface PhaseBadgeProps {
  phase: string | null | undefined;
  draftStatus: string | null | undefined;
}

function PhaseBadge({ phase, draftStatus }: PhaseBadgeProps) {
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';
  const isDraftLive = draftStatus === 'in-progress';
  const isActive = phase === 'active';
  const isPreDraft = phase === 'pre-draft';

  let label: string;
  let bg: string;
  let textColor: string;

  if (isDraftLive) {
    label = 'Draft Live';
    bg = withAlpha(BRAND_GOLD, 0.18);
    textColor = BRAND_GOLD_LIGHT;
  } else if (isActive) {
    label = 'Active';
    bg = withAlpha(GREEN, 0.12);
    textColor = GREEN_LIGHTER;
  } else if (isPreDraft) {
    label = 'Pre-Draft';
    bg = withAlpha(BRAND_NAVY_LIGHT, 0.22);
    textColor = BRAND_NAVY_LIGHT;
  } else {
    label = 'Offseason';
    bg = isLight ? withAlpha(BRAND_NAVY, 0.08) : withAlpha(BG_DARK, 0.4);
    textColor = '$textMuted';
  }

  return (
    <YStack
      borderRadius="$3"
      paddingHorizontal="$2"
      paddingVertical={3}
      style={{ background: bg }}
    >
      <Text
        fontSize="$1"
        fontWeight="700"
        letterSpacing={0.6}
        color={textColor}
        style={{ textTransform: 'uppercase' }}
      >
        {label}
      </Text>
    </YStack>
  );
}

interface LeagueSummaryCardItemProps {
  summary: UserLeagueSummaryFragment;
  onPress: () => void;
}

function LeagueSummaryCardItem({
  summary,
  onPress,
}: LeagueSummaryCardItemProps) {
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';
  const isDraftLive = summary.draftStatus === 'in-progress';
  const isActive = summary.leaguePhase === 'active';
  const isPreDraft = summary.leaguePhase === 'pre-draft';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';

  const wins = summary.wins ?? 0;
  const losses = summary.losses ?? 0;
  const ties = summary.ties ?? 0;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  const rank = summary.rank;
  const totalTeams = summary.totalTeams;

  return (
    <LeagueSummaryCard
      onPress={onPress}
      accessibilityLabel={`View league ${summary.leagueName}`}
      style={
        isDraftLive ? { borderColor: withAlpha(BRAND_GOLD, 0.7) } : undefined
      }
    >
      {/* Header zone */}
      <XStack
        paddingHorizontal="$4"
        paddingTop="$4"
        paddingBottom="$3"
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
      >
        <H3
          fontSize="$6"
          fontWeight="700"
          color="$color"
          flex={1}
          numberOfLines={1}
        >
          {summary.leagueName}
        </H3>
        <PhaseBadge
          phase={summary.leaguePhase}
          draftStatus={summary.draftStatus}
        />
      </XStack>

      {/* Score / status zone */}
      <YStack
        paddingHorizontal="$4"
        paddingBottom="$3"
        gap="$2"
        style={{
          background: isDraftLive
            ? withAlpha(BRAND_GOLD, 0.06)
            : isLight
              ? withAlpha(BRAND_NAVY, 0.06)
              : withAlpha(BG_DARK, 0.35),
        }}
      >
        {isDraftLive && (
          <YStack gap="$1" paddingVertical="$2">
            <Text fontSize="$5" fontWeight="700" color={BRAND_GOLD_LIGHT}>
              Draft in progress
            </Text>
            {summary.draftMode && (
              <Text fontSize="$3" color="$textMuted">
                {summary.draftMode === 'snake'
                  ? 'Snake draft'
                  : summary.draftMode}
                {summary.selectionMethod === 'auto' ? ' · Auto-pick' : ''}
              </Text>
            )}
          </YStack>
        )}

        {!isDraftLive && hasMatchup && (
          <YStack gap="$1" paddingVertical="$2">
            <XStack gap="$2" alignItems="baseline">
              <Text fontSize="$8" fontWeight="800" color={BRAND_GOLD_LIGHT}>
                {summary.userScore?.toFixed(1) ?? '—'}
              </Text>
              <Text fontSize="$4" color="$textMuted" fontWeight="600">
                vs
              </Text>
              <Text fontSize="$8" fontWeight="800" color="$textMuted">
                {summary.opponentScore?.toFixed(1) ?? '—'}
              </Text>
            </XStack>
            {summary.opponentTeamName && (
              <Text fontSize="$3" color="$textMuted">
                vs {summary.opponentTeamName}
              </Text>
            )}
          </YStack>
        )}

        {!isDraftLive && !hasMatchup && (isActive || isPreDraft) && (
          <XStack gap="$5" alignItems="center" paddingVertical="$2">
            <YStack gap="$1">
              <Text fontSize="$7" fontWeight="800" color={BRAND_GOLD_LIGHT}>
                {record}
              </Text>
              <Text
                fontSize="$2"
                color="$textMuted"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Record
              </Text>
            </YStack>
            {rank != null && totalTeams != null && (
              <YStack gap="$1">
                <Text fontSize="$7" fontWeight="800" color="$color">
                  {rank}
                  <Text fontSize="$4" color="$textMuted">
                    /{totalTeams}
                  </Text>
                </Text>
                <Text
                  fontSize="$2"
                  color="$textMuted"
                  fontWeight="600"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Rank
                </Text>
              </YStack>
            )}
          </XStack>
        )}

        {!isDraftLive && !hasMatchup && !isActive && !isPreDraft && (
          <XStack gap="$5" alignItems="center" paddingVertical="$2">
            <YStack gap="$1">
              <Text fontSize="$7" fontWeight="800" color="$textMuted">
                {record}
              </Text>
              <Text
                fontSize="$2"
                color="$textMuted"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Final Record
              </Text>
            </YStack>
          </XStack>
        )}
      </YStack>

      {/* Footer zone */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        gap="$4"
        alignItems="center"
        flexWrap="wrap"
      >
        {summary.currentWeekNumber != null && summary.totalMatchups != null && (
          <Text fontSize="$2" color="$textMuted">
            Week {summary.currentWeekNumber}/{summary.totalMatchups}
          </Text>
        )}
        {isPreDraft && summary.draftScheduledAt && (
          <Text fontSize="$2" color={BRAND_GOLD_LIGHT}>
            Draft: {formatDraftDate(summary.draftScheduledAt)}
          </Text>
        )}
        {!isPreDraft && summary.draftStatus && !isDraftLive && (
          <Text fontSize="$2" color="$textMuted">
            Draft: {formatDraftStatusForCard(summary.draftStatus)}
          </Text>
        )}
        {summary.teamCount != null && (
          <Text fontSize="$2" color="$textMuted">
            {summary.teamCount} teams
          </Text>
        )}
      </XStack>
    </LeagueSummaryCard>
  );
}

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

/* ─── Sport Config ─── */

interface SportConfig {
  key: string;
  icon: BrandIconName;
  title: string;
  description: string;
  route: string;
  /** Raw hex base color — alpha applied at render time so light/dark can use different opacity. */
  accentBase: string;
  /** Alpha applied when rendering accent-based gradients and icon sprite/background treatments. */
  accentAlpha: number;
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
    accentBase: BRAND_NAVY,
    accentAlpha: 0.55,
    available: true,
  },
  {
    key: 'football',
    icon: 'football',
    title: 'Football',
    description:
      'Manage lineups, trade players, and lead your team through every game week.',
    route: '/football',
    accentBase: GREEN_DEEP,
    accentAlpha: 0.35,
    available: false,
  },
];

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

/**
 * Home Page — Landing page for the web application.
 *
 * Renders one of three states: loading, returning-user dashboard,
 * or getting-started view for users with no leagues yet.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth?.user?.id;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';

  // Theme-aware card gradient — applies subtle (0.18) alpha in light, original accentAlpha in dark.
  const sportCardStyleFn = (
    accentBase: string,
    accentAlpha: number,
  ): React.CSSProperties => ({
    background: isLight
      ? `linear-gradient(135deg, ${BG_LIGHT} 0%, ${withAlpha(accentBase, 0.18)} 100%)`
      : `linear-gradient(135deg, ${BG_DARK} 0%, ${withAlpha(accentBase, accentAlpha)} 100%)`,
  });

  const navyPanelGradientReversed = isLight
    ? `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.12)} 0%, ${BG_LIGHT} 100%)`
    : `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BG_DARK} 100%)`;

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
    data: summaryData,
    loading: summariesLoading,
    error: summariesError,
    refetch: refetchSummaries,
  } = useGetUserLeagueSummariesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

  const [fetchArchived, { data: archivedData, loading: archivedLoading }] =
    useGetArchivedUserLeagueSummariesLazyQuery({
      fetchPolicy: 'cache-and-network',
    });

  const handleShowArchived = useCallback(() => {
    setShowArchived(true);
    void fetchArchived();
  }, [fetchArchived]);

  const summaries = summaryData?.getUserLeagueSummaries ?? [];
  const hasLeagues = summaries.length > 0;
  const sortedSummaries = useMemo(
    () => sortByUrgency(summaryData?.getUserLeagueSummaries ?? []),
    [summaryData?.getUserLeagueSummaries],
  );
  const archivedSummaries = archivedData?.getArchivedUserLeagueSummaries ?? [];

  const userName = formatDisplayName(auth?.user?.username || 'Manager');

  // Auto-show tutorial once per user for first-time visitors who have no leagues.
  const getOnboardingKey = (uid: number) => `ls_onboarding_complete_${uid}`;

  useEffect(() => {
    if (!userId) return;
    if (!hasLeagues && !summariesLoading) {
      const key = getOnboardingKey(userId);
      try {
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
  }, [userId, hasLeagues, summariesLoading]);

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

  /* ─── Loading state ─── */
  if (
    auth.isLoading ||
    (!!auth.user && (summariesLoading || (!summaryData && !summariesError)))
  ) {
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

  /* ─── Error state ─── */
  if (
    summariesError &&
    !summariesLoading &&
    !summaryData?.getUserLeagueSummaries
  ) {
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
              onPress={() => void refetchSummaries()}
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
          <ContentContainer paddingTop="$8">
            {/* ─── Compact header ─── */}
            <YStack gap="$4">
              <YStack gap="$2">
                <H1
                  fontSize="$11"
                  fontWeight="800"
                  color="$color"
                  letterSpacing={-0.5}
                  animation="medium"
                  enterStyle={{ opacity: 0, y: 16 }}
                  $sm={{ fontSize: '$9' }}
                >
                  {userName}
                </H1>
                <Paragraph fontSize="$5" color="$textMuted" lineHeight="$6">
                  {summaries.length}{' '}
                  {summaries.length === 1 ? 'league' : 'leagues'}
                  {sortedSummaries.some((s) => s.leaguePhase === 'active') && (
                    <>
                      {' '}
                      ·{' '}
                      {sortedSummaries
                        .filter((s) => s.leaguePhase === 'active')
                        .reduce((acc, s) => acc + (s.wins ?? 0), 0)}
                      -
                      {sortedSummaries
                        .filter((s) => s.leaguePhase === 'active')
                        .reduce((acc, s) => acc + (s.losses ?? 0), 0)}{' '}
                      overall
                    </>
                  )}
                </Paragraph>
              </YStack>

              <XStack gap="$3" alignItems="center">
                <ActionButton
                  onPress={() => navigate(defaultSportRoute)}
                  accessibilityLabel={`Go to ${defaultSport} dashboard`}
                >
                  <Text fontWeight="700">My Dashboard</Text>
                </ActionButton>
                <Text
                  fontSize="$3"
                  fontWeight="600"
                  color="$textMuted"
                  cursor="pointer"
                  onPress={() => navigate('/players/stats')}
                  accessibilityRole="link"
                  hoverStyle={{ color: '$color' }}
                >
                  Browse Stats
                </Text>
              </XStack>
            </YStack>

            {/* ─── League Summary Cards ─── */}
            <YStack gap="$5">
              <SectionTitle>Your Leagues</SectionTitle>

              <YStack gap="$4">
                {sortedSummaries.map((summary) => (
                  <LeagueSummaryCardItem
                    key={summary.leagueId}
                    summary={summary}
                    onPress={() =>
                      navigate(`/baseball/league/${summary.leagueId}`)
                    }
                  />
                ))}
              </YStack>

              {/* ─── Archived leagues toggle ─── */}
              {!showArchived ? (
                <Text
                  fontSize="$3"
                  color="$textMuted"
                  cursor="pointer"
                  alignSelf="flex-start"
                  onPress={handleShowArchived}
                  hoverStyle={{ color: '$color' }}
                  accessibilityRole="button"
                >
                  Show archived leagues
                </Text>
              ) : archivedLoading ? (
                <XStack gap="$2" alignItems="center">
                  <Spinner size="small" color="$brandGoldLight" />
                  <Text fontSize="$3" color="$textMuted">
                    Loading archived leagues…
                  </Text>
                </XStack>
              ) : archivedSummaries.length > 0 ? (
                <YStack gap="$3">
                  <Text fontSize="$4" fontWeight="600" color="$textMuted">
                    Archived
                  </Text>
                  {archivedSummaries.map((summary) => (
                    <LeagueSummaryCardItem
                      key={summary.leagueId}
                      summary={summary}
                      onPress={() =>
                        navigate(`/baseball/league/${summary.leagueId}`)
                      }
                    />
                  ))}
                </YStack>
              ) : null}
            </YStack>

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
                    style={sportCardStyleFn(
                      sport.accentBase,
                      sport.accentAlpha,
                    )}
                    onPress={() => navigate(sport.route)}
                    accessibilityLabel={`Navigate to ${sport.title}`}
                    role="link"
                  >
                    <XStack gap="$4" alignItems="center">
                      <SportIcon
                        style={{
                          background: `linear-gradient(135deg, ${withAlpha(sport.accentBase, sport.accentAlpha)}, ${withAlpha(BRAND_NAVY_LIGHT, 0.08)})`,
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
              <OnThisDayFeed
                onPlayerPress={(id) => navigate(`/players/${id}`)}
              />
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

            <YStack
              gap="$3"
              marginTop="$2"
              alignItems="center"
              animation="medium"
              enterStyle={{ opacity: 0, y: 10 }}
            >
              <ActionButton
                onPress={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
                accessibilityLabel="Create a new baseball league"
              >
                <Text fontWeight="700">Create a League</Text>
              </ActionButton>
              <XStack gap="$4" alignItems="center">
                <Text
                  fontSize="$3"
                  fontWeight="600"
                  color="$textMuted"
                  cursor="pointer"
                  onPress={() => navigate('/baseball/league/join')}
                  accessibilityRole="link"
                  hoverStyle={{ color: '$color' }}
                >
                  Join a League
                </Text>
                <Text fontSize="$3" color="$glassBorder" selectable={false}>
                  ·
                </Text>
                <Text
                  fontSize="$3"
                  fontWeight="600"
                  color="$textMuted"
                  cursor="pointer"
                  onPress={() => setTutorialOpen(true)}
                  accessibilityRole="link"
                  hoverStyle={{ color: '$color' }}
                >
                  How It Works
                </Text>
              </XStack>
            </YStack>
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
                    style={sportCardStyleFn(
                      sport.accentBase,
                      sport.accentAlpha,
                    )}
                    {...(sport.available
                      ? {
                          onPress: () => navigate(sport.route),
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
                          background: `linear-gradient(135deg, ${withAlpha(sport.accentBase, sport.accentAlpha)}, ${withAlpha(BRAND_NAVY_LIGHT, 0.08)})`,
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
                <OnThisDayFeed
                  onPlayerPress={(id) => navigate(`/players/${id}`)}
                />
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
                background: navyPanelGradientReversed,
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
                onPress={() => navigate('/players/stats')}
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
