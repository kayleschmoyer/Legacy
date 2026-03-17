import React from 'react';
import type { GestureResponderEvent } from 'react-native';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H2,
  H3,
  Paragraph,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { AlertTriangle } from '@tamagui/lucide-icons';
import {
  Dialog,
  Input,
  Separator,
  Spinner,
  styled,
  Text,
  H1 as TH1,
  H2 as TH2,
  Paragraph as TParagraph,
} from 'tamagui';
import type { League } from './LeagueCard';
import { PageMeta } from '../PageMeta';
import {
  DEFAULT_NUM_DIVISIONS,
  DEFAULT_NUM_TEAMS,
  MAX_LEAGUE_NAME_LENGTH,
} from '../../constants/league';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
} from '../../api/db/graphql.generated';
import {
  AMBER_LIGHT,
  BG_DARK,
  BLACK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN,
  INJURY_OUT,
  SLATE_400,
  SURFACE_PANEL,
  WHITE,
  withAlpha,
  YELLOW,
} from '../../constants/colors';

/* ─── Draft Status Helpers ─── */

function getLeagueBadge(
  draftStatus?: string | null,
  weekNumber?: number | null,
): { label: string; bg: string; border: string; text: string } {
  switch (draftStatus) {
    case 'in-progress':
      return {
        label: 'Drafting',
        bg: withAlpha(BRAND_NAVY, 0.18),
        border: withAlpha(BRAND_NAVY, 0.45),
        text: BRAND_GOLD_LIGHT,
      };
    case 'completed':
      return {
        label: weekNumber ? `Week ${weekNumber}` : 'In Season',
        bg: withAlpha(GREEN, 0.14),
        border: withAlpha(GREEN, 0.36),
        text: '$green11',
      };
    case 'queued':
    case 'not-started':
      return {
        label: 'Draft Scheduled',
        bg: withAlpha(AMBER_LIGHT, 0.12),
        border: withAlpha(AMBER_LIGHT, 0.3),
        text: '$orange11',
      };
    default:
      return {
        label: draftStatus
          ? draftStatus
              .replace('-', ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase())
          : 'Unknown',
        bg: withAlpha(SLATE_400, 0.12),
        border: withAlpha(SLATE_400, 0.3),
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

const StatsCard = styled(YStack, {
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

const StatsHeader = styled(YStack, {
  gap: '$1',
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
  hoverStyle: {
    borderColor: '$glassBorderHover',
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
  backgroundColor: BRAND_NAVY_LIGHT,
  shadowColor: BRAND_NAVY_LIGHT,
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
  shadowColor: withAlpha(BRAND_NAVY, 0.12),
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

const EmptyStateTitle = styled(TH2, {
  fontSize: '$8',
  fontWeight: '700',
  color: '$color',
});

const EmptyStateDescription = styled(TParagraph, {
  fontSize: '$4',
  color: '$glassTextMuted',
  maxWidth: 440,
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
    backgroundColor: withAlpha(BG_DARK, 0.82),
  },
  focusStyle: {
    borderColor: withAlpha(BRAND_NAVY, 0.6),
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

/* ─── Compact Hero (returning users) ─── */

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
  whiteSpace: 'nowrap',
  $sm: {
    fontSize: '$7',
  },
});

const CompactWelcome = styled(TParagraph, {
  fontSize: '$3',
  color: '$glassTextSubdued',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  $sm: {
    whiteSpace: 'normal',
  },
});

const CompactActions = styled(XStack, {
  gap: '$2',
  flexShrink: 0,
  flexWrap: 'wrap',
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

export function BaseballLandingPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [leagueName, setLeagueName] = React.useState('');
  const [teamCount, setTeamCount] = React.useState<number>(DEFAULT_NUM_TEAMS);
  const [playerPool, setPlayerPool] = React.useState<'all' | 'nl' | 'al'>(
    'all',
  );
  const [draftMode, setDraftMode] = React.useState<'live' | 'automated'>(
    'live',
  );
  const [selectionMethod, setSelectionMethod] = React.useState<
    'standard' | 'auction' | 'random'
  >('standard');
  const [draftOrder, setDraftOrder] = React.useState<'snake' | 'linear'>(
    'snake',
  );
  const [maxRosterSize, setMaxRosterSize] = React.useState<number>(25);
  const [numberOfDivisions, setNumberOfDivisions] = React.useState<number>(
    DEFAULT_NUM_DIVISIONS,
  );
  const [isPublic, setIsPublic] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  // Fetch user leagues from GraphQL
  const {
    data,
    loading: isLoading,
    error,
    refetch,
  } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !auth?.user,
    // Always refetch from network so deletions/adds are reflected immediately
    fetchPolicy: 'cache-and-network',
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
        radial-gradient(ellipse at 10% 15%, ${withAlpha(BRAND_NAVY, 0.28)} 0%, transparent 50%),
        radial-gradient(ellipse at 90% 10%, ${withAlpha(BRAND_SEAM_RED, 0.12)} 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, ${withAlpha(BRAND_NAVY, 0.08)} 0%, transparent 60%),
        radial-gradient(ellipse at 15% 85%, ${withAlpha(BRAND_GOLD, 0.1)} 0%, transparent 50%),
        linear-gradient(180deg, ${withAlpha(BG_DARK, 0.95)} 0%, hsl(var(--background)) 100%)
      `,
      backgroundAttachment: 'fixed',
    }),
    [],
  );

  const handleViewLeague = (leagueId: number) => {
    navigate(`/baseball/league/${leagueId}`);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setShowCreateDialog(open);
    if (!open) {
      setLeagueName('');
      setTeamCount(DEFAULT_NUM_TEAMS);
      setPlayerPool('all');
      setDraftMode('live');
      setSelectionMethod('standard');
      setDraftOrder('snake');
      setMaxRosterSize(25);
      setNumberOfDivisions(DEFAULT_NUM_DIVISIONS);
      setIsPublic(false);
      setCreateError(null);
    }
  };

  const handleCreateLeague = () => {
    setShowCreateDialog(true);
  };

  const handleSubmit = () => {
    const trimmed = leagueName.trim();
    if (
      creating ||
      trimmed.length < 3 ||
      trimmed.length > MAX_LEAGUE_NAME_LENGTH
    )
      return;
    setCreateError(null);
    void createLeague({
      variables: {
        input: {
          leagueName: trimmed,
          numberOfTeams: teamCount,
          numberOfDivisions,
          playerPool,
          draftMode,
          selectionMethod,
          draftOrder,
          maxRosterSize,
          isPublic,
          tradingEnabled: true,
          waiverEnabled: true,
        },
      },
    })
      .then((result) => {
        const id = result.data?.createLeagueAndTeams?.league?.id;
        if (id) {
          navigate(`/baseball/league/${id}`);
        } else {
          setCreateError('Failed to create league. Please try again.');
        }
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to create league. Please try again.';
        setCreateError(msg);
      });
  };

  const handleJoinLeague = () => {
    navigate('/baseball/league/join');
  };

  const handleMockDraft = () => {
    navigate('/baseball/mock-draft');
  };

  const filteredLeagues = leagues.filter((l) =>
    (l?.name || '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  /* ─── Loading guards: prevent blank/wrong state while data resolves ─── */
  if (auth.isLoading || (auth.user && isLoading && !data)) {
    return (
      <PageContainer
        aria-label="Baseball fantasy landing page"
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

  /* ─── Helper: full hero for first-time users ─── */
  const fullHero = (
    <HeroSection
      role="region"
      aria-labelledby="baseball-hero-title"
      style={{
        background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.9)} 0%, ${withAlpha(BRAND_NAVY, 0.55)} 50%, ${withAlpha(BRAND_SEAM_RED, 0.2)} 100%)`,
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        boxShadow: `0 8px 32px ${withAlpha(BRAND_NAVY, 0.18)}, inset 0 1px 0 ${withAlpha(WHITE, 0.05)}`,
      }}
    >
      <HeroContent>
        <HeroBadge>
          <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
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
          <SecondaryButton
            onPress={handleMockDraft}
            accessibilityLabel="Practice with a mock draft simulator"
          >
            <Text fontWeight="700">
              <span role="img" aria-label="baseball">
                ⚾
              </span>{' '}
              Mock Draft
            </Text>
          </SecondaryButton>
        </ActionButtonsRow>
        <Paragraph fontSize="$3" color="$glassTextMuted" maxWidth={440}>
          Draft-ready controls, transparent roster limits, and secure
          invitations built for competitive fantasy managers.
        </Paragraph>
      </HeroContent>

      <HeroSidePanel>
        <StatsCard
          style={{
            background: `linear-gradient(160deg, ${withAlpha(BG_DARK, 0.95)} 0%, ${withAlpha(SURFACE_PANEL, 0.88)} 100%)`,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <StatsHeader>
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
          </StatsHeader>
          <Separator backgroundColor="$glassBorder" />
          <YStack gap="$3" paddingVertical="$2">
            <Paragraph fontSize="$3" color="$glassTextSubdued">
              Create or join a league to start tracking your season — weekly
              matchups, roster stats, and draft countdowns will appear here.
            </Paragraph>
          </YStack>
        </StatsCard>

        <QuickGlanceCard
          style={{
            background: `linear-gradient(160deg, ${withAlpha(SURFACE_PANEL, 0.8)} 0%, ${withAlpha(BG_DARK, 0.65)} 100%)`,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
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
            Make sure your league is ready before first pitch.
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

  /* ─── Helper: compact hero bar for returning users ─── */
  const compactHero = (
    <CompactHeroBanner
      role="region"
      aria-labelledby="baseball-hero-title"
      style={{
        background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.88)} 0%, ${withAlpha(BRAND_NAVY, 0.45)} 50%, ${withAlpha(BRAND_SEAM_RED, 0.12)} 100%)`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: `0 4px 20px ${withAlpha(BRAND_NAVY, 0.14)}, inset 0 1px 0 ${withAlpha(WHITE, 0.04)}`,
      }}
    >
      <CompactHeroLeft>
        <CompactTitle id="baseball-hero-title">
          <span role="img" aria-label="baseball">
            ⚾
          </span>{' '}
          Baseball Fantasy
        </CompactTitle>
        <CompactWelcome>Welcome back, {userName}</CompactWelcome>
      </CompactHeroLeft>
      <CompactActions>
        <CompactButton
          onPress={handleCreateLeague}
          accessibilityLabel="Create a new baseball league"
        >
          <Text fontWeight="700">+ Create</Text>
        </CompactButton>
        <CompactButton
          onPress={handleJoinLeague}
          accessibilityLabel="Join an existing baseball league"
        >
          <Text fontWeight="700">Join</Text>
        </CompactButton>
        <CompactButton
          onPress={handleMockDraft}
          accessibilityLabel="Practice with a mock draft simulator"
        >
          <Text fontWeight="700">Mock Draft</Text>
        </CompactButton>
      </CompactActions>
    </CompactHeroBanner>
  );

  return (
    <PageContainer
      aria-label="Baseball fantasy landing page"
      style={pageBackgroundStyle}
    >
      <PageMeta
        title="Baseball"
        description="Manage your fantasy baseball leagues, draft players, track live stats, and compete with friends on Legacy Sports."
      />
      <ContentContainer>
        {/* Returning users: compact hero → leagues list (zero-scroll) */}
        {/* New users: full hero → empty state CTA */}
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
              Sign in to manage your fantasy baseball leagues
            </Paragraph>
            <Paragraph fontSize="$3" color={BRAND_GOLD_LIGHT}>
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
                      background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.8)} 0%, ${withAlpha(SURFACE_PANEL, 0.58)} 100%)`,
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
                      ) : league.weekAdvanceStatus === 'failed' ? (
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
                        if (league.id) handleViewLeague(league.id);
                      }}
                      accessibilityLabel={`View ${league.name || 'league'}`}
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
              style={{
                background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.82)} 0%, ${withAlpha(BRAND_NAVY, 0.22)} 100%)`,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <EmptyStateIcon>
                <Text aria-hidden="true">⚾</Text>
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
                </>
              )}
            </EmptyState>
          )}
        </LeaguesSection>
      </ContentContainer>

      {/* Create League - Quick Dialog */}
      <Dialog
        modal
        open={showCreateDialog}
        onOpenChange={handleDialogOpenChange}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            animation="medium"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
            backgroundColor={withAlpha(BLACK, 0.65)}
          />
          <Dialog.Content
            bordered
            elevate
            maxWidth={560}
            width="100%"
            maxHeight="90vh"
            backgroundColor="$color2"
            borderColor={withAlpha(BRAND_NAVY, 0.28)}
            borderRadius="$7"
            animation="bouncy"
            enterStyle={{ opacity: 0, y: -20, scale: 0.96 }}
            exitStyle={{ opacity: 0, y: 10, scale: 0.98 }}
            aria-labelledby="create-league-title"
            aria-describedby="create-league-desc"
            style={{
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: `0 16px 48px ${withAlpha(BLACK, 0.3)}, 0 0 0 1px ${withAlpha(BRAND_NAVY, 0.12)}`,
            }}
          >
            <YStack space="$3" flex={1} overflow="hidden">
              <YStack>
                <H2 size="$6" id="create-league-title">
                  Create League
                </H2>
                <Paragraph color="$gray11" id="create-league-desc">
                  Configure your league settings before inviting managers to
                  join.
                </Paragraph>
              </YStack>

              <YStack
                flex={1}
                overflow="auto"
                pointerEvents={creating ? 'none' : 'auto'}
                opacity={creating ? 0.5 : 1}
                {...(creating ? { inert: '' } : {})}
                aria-disabled={creating}
              >
                <YStack space="$3" paddingBottom="$2">
                  {/* League Name */}
                  <YStack space="$1.5">
                    <Text fontWeight="600" fontSize="$3" color="$gray12">
                      League Name
                    </Text>
                    <Input
                      placeholder="e.g., Saturday Sluggers"
                      value={leagueName}
                      onChangeText={setLeagueName}
                      onSubmitEditing={handleSubmit}
                      autoFocus
                      maxLength={MAX_LEAGUE_NAME_LENGTH}
                      size="$3"
                      aria-label="League name"
                    />
                  </YStack>

                  {/* Number of Teams */}
                  <YStack space="$1.5">
                    <Text fontWeight="600" fontSize="$3" color="$gray12">
                      Number of Teams
                    </Text>
                    <XStack gap="$1.5" flexWrap="wrap">
                      {[4, 6, 8, 10, 12, 14, 16].map((n) => (
                        <Button
                          key={n}
                          size="$2"
                          variant={teamCount === n ? 'primary' : 'outlined'}
                          onPress={() => setTeamCount(n)}
                          backgroundColor={
                            teamCount === n ? BRAND_NAVY_LIGHT : '$color2'
                          }
                          borderColor={
                            teamCount === n ? BRAND_NAVY_LIGHT : '$borderColor'
                          }
                          borderWidth={teamCount === n ? 2 : 1}
                          aria-pressed={teamCount === n}
                          aria-label={`Select ${n} teams`}
                        >
                          <Text
                            fontSize="$2"
                            color={teamCount === n ? BRAND_GOLD : '$color'}
                          >
                            {n}
                          </Text>
                        </Button>
                      ))}
                    </XStack>
                  </YStack>

                  {/* Divisions + Player Pool — side by side */}
                  <XStack gap="$3">
                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Divisions
                      </Text>
                      <XStack gap="$1.5" flexWrap="wrap">
                        {[1, 2, 3, 4].map((n) => (
                          <Button
                            key={n}
                            size="$2"
                            onPress={() => setNumberOfDivisions(n)}
                            backgroundColor={
                              numberOfDivisions === n
                                ? BRAND_NAVY_LIGHT
                                : '$color2'
                            }
                            borderColor={
                              numberOfDivisions === n
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={numberOfDivisions === n ? 2 : 1}
                            aria-pressed={numberOfDivisions === n}
                            aria-label={`${n} division${n === 1 ? '' : 's'}`}
                          >
                            <Text
                              fontSize="$2"
                              color={
                                numberOfDivisions === n ? BRAND_GOLD : '$color'
                              }
                            >
                              {n}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>

                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Player Pool
                      </Text>
                      <XStack gap="$1.5" flexWrap="wrap">
                        {(
                          [
                            ['all', 'All MLB'],
                            ['nl', 'NL'],
                            ['al', 'AL'],
                          ] as const
                        ).map(([val, label]) => (
                          <Button
                            key={val}
                            size="$2"
                            onPress={() => setPlayerPool(val)}
                            backgroundColor={
                              playerPool === val ? BRAND_NAVY_LIGHT : '$color2'
                            }
                            borderColor={
                              playerPool === val
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={playerPool === val ? 2 : 1}
                            aria-pressed={playerPool === val}
                            aria-label={`Player pool: ${label}`}
                          >
                            <Text
                              fontSize="$2"
                              color={playerPool === val ? BRAND_GOLD : '$color'}
                            >
                              {label}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>
                  </XStack>

                  {/* Draft Mode + Selection Method — side by side */}
                  <XStack gap="$3">
                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Draft Mode
                      </Text>
                      <XStack gap="$1.5">
                        {(
                          [
                            ['live', 'Live'],
                            ['automated', 'Auto'],
                          ] as const
                        ).map(([val, label]) => (
                          <Button
                            key={val}
                            size="$2"
                            onPress={() => {
                              setDraftMode(val);
                              if (val === 'automated')
                                setSelectionMethod('random');
                            }}
                            backgroundColor={
                              draftMode === val ? BRAND_NAVY_LIGHT : '$color2'
                            }
                            borderColor={
                              draftMode === val
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={draftMode === val ? 2 : 1}
                            aria-pressed={draftMode === val}
                            aria-label={`Draft mode: ${label}`}
                          >
                            <Text
                              fontSize="$2"
                              color={draftMode === val ? BRAND_GOLD : '$color'}
                            >
                              {label}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>

                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Selection Method
                      </Text>
                      <XStack gap="$1.5" flexWrap="wrap">
                        {(
                          [
                            ['standard', 'Standard'],
                            ['auction', 'Auction'],
                            ['random', 'Random'],
                          ] as const
                        ).map(([val, label]) => (
                          <Button
                            key={val}
                            size="$2"
                            disabled={
                              draftMode === 'automated' && val !== 'random'
                            }
                            onPress={() => setSelectionMethod(val)}
                            backgroundColor={
                              selectionMethod === val
                                ? BRAND_NAVY_LIGHT
                                : '$color2'
                            }
                            borderColor={
                              selectionMethod === val
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={selectionMethod === val ? 2 : 1}
                            opacity={
                              draftMode === 'automated' && val !== 'random'
                                ? 0.4
                                : 1
                            }
                            aria-pressed={selectionMethod === val}
                            aria-label={`Selection method: ${label}`}
                          >
                            <Text
                              fontSize="$2"
                              color={
                                selectionMethod === val ? BRAND_GOLD : '$color'
                              }
                            >
                              {label}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>
                  </XStack>

                  {/* Draft Order + Max Roster Size — side by side */}
                  <XStack gap="$3">
                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Draft Order
                      </Text>
                      <XStack gap="$1.5">
                        {(
                          [
                            ['snake', 'Snake'],
                            ['linear', 'Linear'],
                          ] as const
                        ).map(([val, label]) => (
                          <Button
                            key={val}
                            size="$2"
                            onPress={() => setDraftOrder(val)}
                            backgroundColor={
                              draftOrder === val ? BRAND_NAVY_LIGHT : '$color2'
                            }
                            borderColor={
                              draftOrder === val
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={draftOrder === val ? 2 : 1}
                            aria-pressed={draftOrder === val}
                            aria-label={`Draft order: ${label}`}
                          >
                            <Text
                              fontSize="$2"
                              color={draftOrder === val ? BRAND_GOLD : '$color'}
                            >
                              {label}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>

                    <YStack space="$1.5" flex={1}>
                      <Text fontWeight="600" fontSize="$3" color="$gray12">
                        Max Roster Size
                      </Text>
                      <XStack gap="$1.5" flexWrap="wrap">
                        {[20, 22, 25, 30, 35, 40].map((n) => (
                          <Button
                            key={n}
                            size="$2"
                            onPress={() => setMaxRosterSize(n)}
                            backgroundColor={
                              maxRosterSize === n ? BRAND_NAVY_LIGHT : '$color2'
                            }
                            borderColor={
                              maxRosterSize === n
                                ? BRAND_NAVY_LIGHT
                                : '$borderColor'
                            }
                            borderWidth={maxRosterSize === n ? 2 : 1}
                            aria-pressed={maxRosterSize === n}
                            aria-label={`Max roster size: ${n}`}
                          >
                            <Text
                              fontSize="$2"
                              color={
                                maxRosterSize === n ? BRAND_GOLD : '$color'
                              }
                            >
                              {n}
                            </Text>
                          </Button>
                        ))}
                      </XStack>
                    </YStack>
                  </XStack>

                  {/* League Visibility */}
                  <YStack space="$1.5">
                    <Text fontWeight="600" fontSize="$3" color="$gray12">
                      League Visibility
                    </Text>
                    <XStack gap="$1.5">
                      <Button
                        size="$2"
                        flex={1}
                        onPress={() => setIsPublic(false)}
                        backgroundColor={
                          !isPublic ? BRAND_NAVY_LIGHT : '$color2'
                        }
                        borderColor={
                          !isPublic ? BRAND_NAVY_LIGHT : '$borderColor'
                        }
                        borderWidth={!isPublic ? 2 : 1}
                        aria-pressed={!isPublic}
                        aria-label="Private league"
                      >
                        <Text
                          fontSize="$2"
                          color={!isPublic ? BRAND_GOLD : '$color'}
                        >
                          <span role="img" aria-label="private">
                            🔒
                          </span>{' '}
                          Private
                        </Text>
                      </Button>
                      <Button
                        size="$2"
                        flex={1}
                        onPress={() => setIsPublic(true)}
                        backgroundColor={
                          isPublic ? BRAND_NAVY_LIGHT : '$color2'
                        }
                        borderColor={
                          isPublic ? BRAND_NAVY_LIGHT : '$borderColor'
                        }
                        borderWidth={isPublic ? 2 : 1}
                        aria-pressed={isPublic}
                        aria-label="Public league"
                      >
                        <Text
                          fontSize="$2"
                          color={isPublic ? BRAND_GOLD : '$color'}
                        >
                          <span role="img" aria-label="public">
                            🌐
                          </span>{' '}
                          Public
                        </Text>
                      </Button>
                    </XStack>
                    <Text fontSize="$1" color="$gray10">
                      {isPublic
                        ? 'Anyone can browse and join this league without an invite code'
                        : 'Only people with your invite code can join this league'}
                    </Text>
                  </YStack>
                </YStack>
              </YStack>

              <Separator />

              {createError ? (
                <XStack
                  backgroundColor="$red3"
                  borderColor="$red6"
                  borderWidth={1}
                  borderRadius="$3"
                  padding="$2"
                  gap="$2"
                  alignItems="center"
                  role="alert"
                >
                  <AlertTriangle size={14} color="$red10" />
                  <Text fontSize="$2" color="$red10" flex={1}>
                    {createError}
                  </Text>
                </XStack>
              ) : null}

              <XStack justifyContent="flex-end" gap="$3">
                {createError && (
                  <Text color="$red10" fontSize="$2" role="alert">
                    {createError}
                  </Text>
                )}
                <Dialog.Close asChild>
                  <SecondaryButton disabled={creating}>Cancel</SecondaryButton>
                </Dialog.Close>
                <PrimaryButton
                  disabled={
                    creating ||
                    leagueName.trim().length < 3 ||
                    leagueName.trim().length > MAX_LEAGUE_NAME_LENGTH
                  }
                  onPress={handleSubmit}
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
