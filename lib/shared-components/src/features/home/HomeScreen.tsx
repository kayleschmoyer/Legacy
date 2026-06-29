import React, { useMemo } from 'react';
import {
  H1,
  H2,
  isWeb,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import type { GestureResponderEvent } from 'react-native';
import { formatDraftDate } from '@legacy-sports/utils';
import { formatEraDescriptor, formatEraYears } from './homeSummaryFormatters';
import { BrandIcon, type BrandIconName } from '../../components/icons';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  GREEN,
  GREEN_DEEP,
  GREEN_LIGHTER,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_INTERFACE,
  TEXT_SECONDARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// Re-export the shared display-name formatter so app wrappers can reuse it.
export { formatDisplayName } from './homeSummaryFormatters';

/* ─── Home-only color constants (mirror apps/web/src/constants/colors) ─── */

const SURFACE_DEEP = '#0F1A2D';
const SURFACE_HOVER = '#1C2A47';
const TEXT_TERTIARY = '#6C80BA';
const BORDER_STRONG = '#2F3B53';
const BORDER_INTERACTIVE = '#4D5D80';
const SCORE_LOSS = '#E07A8C';
const AMBER_WARM = '#E3B870';

/* ─── Typography helpers (web uses Heritage fonts; native falls back) ─── */

const DISPLAY_FONT = isWeb
  ? 'Big Shoulders Display, system-ui, sans-serif'
  : undefined;
const BODY_FONT = isWeb ? 'Literata, Georgia, serif' : undefined;

/* ─── Public types ─── */

/**
 * Presentational league-summary shape consumed by the dashboard. Structurally
 * compatible with each app's `UserLeagueSummary` GraphQL fragment so web and
 * mobile can pass their own generated arrays directly.
 */
export interface HomeLeagueSummary {
  leagueId?: number | null;
  leagueName?: string | null;
  sport?: string | null;
  leaguePhase?: string | null;
  seasonNumber?: number | null;
  draftStatus?: string | null;
  draftScheduledAt?: string | null;
  draftMode?: string | null;
  selectionMethod?: string | null;
  teamCount?: number | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  rank?: number | null;
  totalTeams?: number | null;
  pointsFor?: number | null;
  currentWeekNumber?: number | null;
  totalMatchups?: number | null;
  matchupId?: number | null;
  matchupStatus?: string | null;
  matchupEndTime?: string | null;
  userScore?: number | null;
  opponentScore?: number | null;
  opponentTeamName?: string | null;
  eraFilter?: string | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  isCommissioner?: boolean | null;
}

/** Aggregate stats shown in the returning-user header. Derived from `leagues` when omitted. */
export interface HomeUserStats {
  leagueCount: number;
  aggregateRecord?: string | null;
  firstPlaceCount?: number;
}

export interface HomeScreenProps {
  /** Display name for the greeting (already formatted). */
  userName?: string;
  /** Active leagues. The component sorts them by urgency internally. */
  leagues?: HomeLeagueSummary[];
  /** Archived/completed leagues, shown behind the "show archived" toggle. */
  archivedLeagues?: HomeLeagueSummary[];
  /** Count of archived leagues for the toggle label before they are loaded. */
  archivedCount?: number | null;
  /** Optional aggregate stats override; derived from `leagues` when absent. */
  userStats?: HomeUserStats;
  /** On This Day feed node — each app supplies its own (self-fetching) feed. */
  onThisDay?: React.ReactNode;
  /** Default sport, controls ordering + On This Day visibility for new users. */
  defaultSport?: 'baseball' | 'football';
  /** Light theme variant for sport-card backgrounds. */
  isLight?: boolean;
  /** Whether the current user has an active premium subscription. Controls premium-only CTAs in the empty state. */
  isPremium?: boolean;

  loading?: boolean;
  error?: boolean;
  showArchived?: boolean;
  archivedLoading?: boolean;

  onShowArchived?: () => void;
  onRetry?: () => void;
  onViewLeague: (summary: HomeLeagueSummary) => void;
  onSetLineup?: (summary: HomeLeagueSummary) => void;
  onMockDraft?: (summary: HomeLeagueSummary) => void;
  onCreateLeague: () => void;
  onJoinLeague: () => void;
  onBrowseStats: () => void;
  onViewSport: (sportKey: 'baseball' | 'football') => void;
  onStartMockDraft?: () => void;
  onPlayerPress?: (playerId: number) => void;
  onHowItWorks?: () => void;
  /** Navigate to create a salary cap league. Shown only when isPremium is true. */
  onCreateSalaryCapLeague?: () => void;
  /** Navigate to create an auction draft league. Shown only when isPremium is true. */
  onCreateAuctionLeague?: () => void;
}

/* ─── Sport config ─── */

interface SportConfig {
  key: 'baseball' | 'football';
  icon: BrandIconName;
  title: string;
  description: string;
  accentBase: string;
  accentAlpha: number;
  available: boolean;
}

const SPORTS: SportConfig[] = [
  {
    key: 'baseball',
    icon: 'baseball',
    title: 'Baseball',
    description:
      '162 games, every era since 1876. Draft Ruth alongside Trout — then watch the archived tape play out.',
    accentBase: BRAND_NAVY,
    accentAlpha: 0.55,
    available: true,
  },
  {
    key: 'football',
    icon: 'football',
    title: 'Football',
    description:
      'Kickoff for the 2026 season. Same archive-first format, turf green instead of seam red.',
    accentBase: GREEN_DEEP,
    accentAlpha: 0.35,
    available: false,
  },
];

/* ─── Urgency sort ─── */

function urgencyKey(s: HomeLeagueSummary): number {
  if (s.draftStatus === 'in-progress') return 0;
  if (s.leaguePhase === 'active') return 1;
  if (s.leaguePhase === 'pre-draft') return 2;
  return 3;
}

function sortByUrgency(summaries: HomeLeagueSummary[]): HomeLeagueSummary[] {
  return [...summaries].sort((a, b) => urgencyKey(a) - urgencyKey(b));
}

/* ─── Small helpers ─── */

function recordOf(s: HomeLeagueSummary): string {
  const wins = s.wins ?? 0;
  const losses = s.losses ?? 0;
  const ties = s.ties ?? 0;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/* ─── Reusable bits ─── */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <YStack gap="$1">
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1.6}
        textTransform="uppercase"
        color={BRAND_GOLD_LIGHT}
      >
        {eyebrow}
      </Text>
      <H2
        margin={0}
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={32}
        lineHeight={35}
        color={TEXT_INTERFACE}
      >
        {title}
      </H2>
    </YStack>
  );
}

type ButtonVariant = 'gold' | 'navy' | 'outline';

function ActionButton({
  label,
  onPress,
  variant = 'navy',
  disabled,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}) {
  const styles: Record<
    ButtonVariant,
    { bg: string; color: string; border: string }
  > = {
    gold: { bg: BRAND_GOLD, color: BG_DARK, border: BRAND_GOLD },
    navy: { bg: BRAND_NAVY, color: WHITE, border: BRAND_NAVY_LIGHT },
    outline: {
      bg: 'transparent',
      color: TEXT_INTERFACE,
      border: BORDER_STRONG,
    },
  };
  const s = styles[variant];
  return (
    <XStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      opacity={disabled ? 0.45 : 1}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      backgroundColor={s.bg}
      borderWidth={1}
      borderColor={s.border}
      borderRadius={12}
      paddingVertical={11}
      paddingHorizontal={20}
      alignItems="center"
      justifyContent="center"
      hoverStyle={disabled ? undefined : { opacity: 0.9 }}
      pressStyle={disabled ? undefined : { opacity: 0.8 }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={13}
        letterSpacing={1}
        textTransform="uppercase"
        color={s.color}
      >
        {label}
      </Text>
    </XStack>
  );
}

function PhaseChip({
  phase,
  draftStatus,
  hasMatchup,
}: {
  phase?: string | null;
  draftStatus?: string | null;
  hasMatchup?: boolean;
}) {
  const isDraftLive = draftStatus === 'in-progress';
  const isActive = phase === 'active';
  const isPreDraft = phase === 'pre-draft';

  let label: string;
  let bg: string;
  let textColor: string;

  if (isDraftLive) {
    label = 'Draft Live';
    bg = withAlpha(BRAND_SEAM_RED, 0.15);
    textColor = BRAND_SEAM_RED_LIGHT;
  } else if (isActive && hasMatchup) {
    label = 'Active · Live';
    bg = withAlpha(GREEN, 0.12);
    textColor = GREEN_LIGHTER;
  } else if (isActive) {
    label = 'Active';
    bg = withAlpha(GREEN, 0.12);
    textColor = GREEN_LIGHTER;
  } else if (isPreDraft) {
    label = 'Pre-Draft';
    bg = withAlpha(BRAND_GOLD, 0.12);
    textColor = BRAND_GOLD_LIGHT;
  } else {
    label = 'Offseason';
    bg = withAlpha(TEXT_TERTIARY, 0.1);
    textColor = TEXT_TERTIARY;
  }

  return (
    <XStack
      alignSelf="flex-start"
      backgroundColor={bg}
      borderWidth={1}
      borderColor={withAlpha(textColor, 0.4)}
      borderRadius={9999}
      paddingVertical={5}
      paddingHorizontal={11}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.3}
        textTransform="uppercase"
        color={textColor}
      >
        {label}
      </Text>
    </XStack>
  );
}

function Stat({
  big,
  label,
  color = TEXT_INTERFACE,
}: {
  big: string;
  label: string;
  color?: string;
}) {
  return (
    <YStack gap="$1">
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={40}
        lineHeight={40}
        color={color}
        fontVariant={['tabular-nums']}
      >
        {big}
      </Text>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.1}
        textTransform="uppercase"
        color={TEXT_SECONDARY}
      >
        {label}
      </Text>
    </YStack>
  );
}

/* ─── Hero right panel ─── */

function HeroRightPanel({ summary }: { summary: HomeLeagueSummary }) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  const panel = (children: React.ReactNode) => (
    <YStack
      backgroundColor={withAlpha(BG_DARK, 0.55)}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={16}
      padding={20}
      gap="$3"
    >
      {children}
    </YStack>
  );

  if (isDraftLive) {
    return panel(
      <>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={28}
          lineHeight={28}
          color={BRAND_SEAM_RED_LIGHT}
        >
          Draft in Progress
        </Text>
        {summary.draftMode ? (
          <Text fontFamily={BODY_FONT} fontSize={15} color={TEXT_SECONDARY}>
            {summary.draftMode === 'snake' ? 'Snake draft' : summary.draftMode}
            {summary.selectionMethod === 'auto' ? ' · Auto-pick' : ''}
          </Text>
        ) : null}
      </>,
    );
  }

  if (hasMatchup) {
    const userScore = summary.userScore ?? 0;
    const oppScore = summary.opponentScore ?? 0;
    const isLeading = userScore >= oppScore;
    return panel(
      <XStack alignItems="center" justifyContent="space-between" gap="$4">
        <YStack alignItems="center" gap="$2" flex={1}>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={13}
            letterSpacing={0.8}
            textTransform="uppercase"
            color={TEXT_INTERFACE}
          >
            My Team
          </Text>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={isLeading ? 48 : 40}
            lineHeight={isLeading ? 48 : 40}
            color={isLeading ? BRAND_GOLD_LIGHT : TEXT_INTERFACE}
            fontVariant={['tabular-nums']}
          >
            {userScore.toFixed(1)}
          </Text>
        </YStack>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={15}
          letterSpacing={2.5}
          color={TEXT_TERTIARY}
        >
          VS
        </Text>
        <YStack alignItems="center" gap="$2" flex={1}>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={13}
            letterSpacing={0.8}
            textTransform="uppercase"
            color={TEXT_INTERFACE}
            numberOfLines={1}
          >
            {summary.opponentTeamName ?? 'Opponent'}
          </Text>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={!isLeading ? 48 : 40}
            lineHeight={!isLeading ? 48 : 40}
            color={!isLeading ? BRAND_GOLD_LIGHT : TEXT_INTERFACE}
            fontVariant={['tabular-nums']}
          >
            {oppScore.toFixed(1)}
          </Text>
        </YStack>
      </XStack>,
    );
  }

  if (isPreDraft && summary.draftScheduledAt) {
    return panel(
      <Stat
        big={formatDraftDate(summary.draftScheduledAt)}
        label="Draft Scheduled"
        color={BRAND_GOLD_LIGHT}
      />,
    );
  }

  return panel(
    <XStack gap="$6" alignItems="center">
      <Stat big={recordOf(summary)} label="Record" color={BRAND_GOLD_LIGHT} />
      {summary.rank != null && summary.totalTeams != null ? (
        <Stat big={`#${summary.rank}`} label={`of ${summary.totalTeams}`} />
      ) : null}
    </XStack>,
  );
}

/* ─── Hero league card ─── */

function LeagueHeroCard({
  summary,
  onPress,
  onSetLineup,
}: {
  summary: HomeLeagueSummary;
  onPress: () => void;
  onSetLineup?: () => void;
}) {
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const eraDesc = formatEraDescriptor(summary);

  return (
    <YStack
      testID="home-hero-card"
      accessibilityRole="button"
      accessibilityLabel={`Open ${summary.leagueName ?? 'League'}`}
      onPress={onPress}
      cursor="pointer"
      borderRadius={24}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.22)}
      backgroundColor={SURFACE_DEEP}
      padding={32}
      gap="$5"
      $gtSm={{ flexDirection: 'row', alignItems: 'center' }}
      hoverStyle={{ borderColor: withAlpha(BRAND_GOLD, 0.4) }}
    >
      <YStack flex={1} gap="$4" minWidth={0}>
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          <PhaseChip
            phase={summary.leaguePhase}
            draftStatus={summary.draftStatus}
            hasMatchup={hasMatchup}
          />
        </XStack>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={36}
          lineHeight={38}
          color={WHITE}
        >
          {summary.leagueName ?? 'League'}
        </Text>
        {eraDesc ? (
          <Text fontFamily={BODY_FONT} fontSize={15} color={TEXT_SECONDARY}>
            {eraDesc}
          </Text>
        ) : null}
        <XStack gap="$3" flexWrap="wrap" alignItems="center">
          {summary.currentWeekNumber != null &&
          summary.totalMatchups != null ? (
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.1}
              textTransform="uppercase"
              color={TEXT_SECONDARY}
            >
              Week {summary.currentWeekNumber}/{summary.totalMatchups}
            </Text>
          ) : null}
          {summary.teamCount != null ? (
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.1}
              textTransform="uppercase"
              color={TEXT_SECONDARY}
            >
              {summary.teamCount} teams
            </Text>
          ) : null}
        </XStack>
        <XStack gap="$2" marginTop="$1" flexWrap="wrap">
          <ActionButton
            label="View League"
            variant="gold"
            onPress={onPress}
            testID="home-hero-view-league"
          />
          {onSetLineup ? (
            <ActionButton
              label="Set Lineup"
              variant="outline"
              onPress={onSetLineup}
            />
          ) : null}
        </XStack>
      </YStack>
      <YStack $gtSm={{ width: 280 }} width="100%">
        <HeroRightPanel summary={summary} />
      </YStack>
    </YStack>
  );
}

/* ─── League list row ─── */

function LeagueListRow({
  summary,
  onPress,
  onMockDraft,
}: {
  summary: HomeLeagueSummary;
  onPress: () => void;
  onMockDraft?: () => void;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  let scoreBig: string;
  let scoreLabel: string;
  let scoreColor = TEXT_INTERFACE;

  if (isDraftLive) {
    scoreBig = 'Live';
    scoreLabel = summary.draftMode ?? 'Draft';
    scoreColor = BRAND_SEAM_RED_LIGHT;
  } else if (hasMatchup) {
    const userScore = summary.userScore ?? 0;
    const oppScore = summary.opponentScore ?? 0;
    const isLeading = userScore >= oppScore;
    scoreBig = userScore.toFixed(1);
    scoreLabel = `vs ${oppScore.toFixed(1)}${summary.opponentTeamName ? ` ${summary.opponentTeamName}` : ''}`;
    scoreColor = isLeading ? BRAND_GOLD_LIGHT : SCORE_LOSS;
  } else if (isPreDraft && summary.draftScheduledAt) {
    scoreBig = formatDraftDate(summary.draftScheduledAt);
    scoreLabel = 'Draft scheduled';
    scoreColor = BRAND_GOLD_LIGHT;
  } else {
    scoreBig = recordOf(summary);
    scoreLabel =
      summary.rank != null && summary.totalTeams != null
        ? `Rank #${summary.rank} of ${summary.totalTeams}`
        : 'Record';
  }

  const years = formatEraYears(summary);
  const subParts: string[] = [];
  if (years) subParts.push(years);
  if (summary.teamCount != null) subParts.push(`${summary.teamCount} teams`);
  if (summary.isCommissioner) subParts.push('You commission this one');

  return (
    <XStack
      accessibilityRole="button"
      accessibilityLabel={`Open ${summary.leagueName ?? 'League'}`}
      onPress={onPress}
      cursor="pointer"
      backgroundColor={SURFACE_CARD}
      paddingVertical={18}
      paddingHorizontal={22}
      gap="$3"
      alignItems="center"
      hoverStyle={{ backgroundColor: SURFACE_HOVER }}
    >
      <YStack flex={1} gap="$1" minWidth={0}>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="700"
          fontSize={18}
          color={TEXT_INTERFACE}
          numberOfLines={1}
        >
          {summary.leagueName ?? 'League'}
        </Text>
        {subParts.length > 0 ? (
          <Text
            fontFamily={BODY_FONT}
            fontSize={13}
            color={TEXT_SECONDARY}
            numberOfLines={1}
          >
            {subParts.join(' · ')}
          </Text>
        ) : null}
        {isPreDraft && onMockDraft ? (
          <XStack
            accessibilityRole="button"
            accessibilityLabel={`Run a mock draft for ${summary.leagueName ?? 'this league'}`}
            onPress={(e: GestureResponderEvent) => {
              e.stopPropagation();
              onMockDraft();
            }}
            alignSelf="flex-start"
            marginTop="$1"
            borderWidth={1}
            borderColor={BORDER_STRONG}
            borderRadius={9999}
            paddingVertical={8}
            paddingHorizontal={12}
            cursor="pointer"
            hoverStyle={{ borderColor: BORDER_INTERACTIVE }}
          >
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.1}
              textTransform="uppercase"
              color={TEXT_SECONDARY}
            >
              Mock Draft
            </Text>
          </XStack>
        ) : null}
      </YStack>
      <YStack gap="$1" alignItems="flex-end" maxWidth={160}>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={22}
          lineHeight={22}
          color={scoreColor}
          fontVariant={['tabular-nums']}
        >
          {scoreBig}
        </Text>
        <Text
          fontFamily={BODY_FONT}
          fontSize={12}
          color={TEXT_SECONDARY}
          numberOfLines={1}
        >
          {scoreLabel}
        </Text>
      </YStack>
      <Text fontSize={20} color={TEXT_TERTIARY}>
        ›
      </Text>
    </XStack>
  );
}

/* ─── Sport card ─── */

function SportCard({
  sport,
  isLight,
  full,
  onView,
  onCreate,
}: {
  sport: SportConfig;
  isLight?: boolean;
  full?: boolean;
  onView: () => void;
  onCreate: () => void;
}) {
  const bg = isLight
    ? withAlpha(sport.accentBase, 0.18)
    : withAlpha(sport.accentBase, sport.accentAlpha);

  return (
    <YStack
      flex={1}
      backgroundColor={bg}
      borderWidth={1}
      borderColor={withAlpha(WHITE, 0.08)}
      borderRadius={20}
      padding={full ? 32 : 28}
      gap="$4"
      opacity={sport.available ? 1 : 0.6}
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
        <YStack
          width={full ? 72 : 64}
          height={full ? 72 : 64}
          borderRadius={12}
          backgroundColor={withAlpha(BG_DARK, 0.55)}
          borderWidth={1}
          borderColor={PANEL_BORDER}
          alignItems="center"
          justifyContent="center"
        >
          <BrandIcon
            name={sport.icon}
            size={full ? 40 : 36}
            decorative={false}
            title={sport.title}
          />
        </YStack>
        {full ? (
          <XStack
            backgroundColor={
              sport.available
                ? withAlpha(GREEN, 0.12)
                : withAlpha(AMBER_WARM, 0.1)
            }
            borderWidth={1}
            borderColor={
              sport.available
                ? withAlpha(GREEN, 0.4)
                : withAlpha(AMBER_WARM, 0.35)
            }
            borderRadius={9999}
            paddingVertical={5}
            paddingHorizontal={11}
          >
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.3}
              textTransform="uppercase"
              color={sport.available ? GREEN_LIGHTER : AMBER_WARM}
            >
              {sport.available ? 'Live Season' : 'Coming Soon'}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      <YStack gap="$1">
        <Text
          testID={`sport-card-title-${sport.key}`}
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={full ? 32 : 26}
          color={WHITE}
        >
          {sport.title}
        </Text>
        <Text
          fontFamily={BODY_FONT}
          fontSize={full ? 15 : 14}
          color={TEXT_SECONDARY}
        >
          {sport.description}
        </Text>
      </YStack>

      <XStack gap="$2" flexWrap="wrap" marginTop="$1">
        {sport.available ? (
          <>
            <ActionButton
              label="Create League"
              variant="gold"
              onPress={onCreate}
            />
            <ActionButton
              label="View Leagues"
              variant="outline"
              onPress={onView}
            />
          </>
        ) : (
          <>
            <ActionButton label="View Leagues" variant="outline" disabled />
            <ActionButton label="Create League" variant="outline" disabled />
          </>
        )}
      </XStack>
    </YStack>
  );
}

/* ─── Stats CTA ─── */

function StatsCta({
  onPress,
  isNewUser,
}: {
  onPress: () => void;
  isNewUser?: boolean;
}) {
  return (
    <XStack
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={16}
      padding={24}
      gap="$4"
      alignItems="center"
      flexWrap="wrap"
    >
      <YStack flex={1} minWidth={200} gap="$1">
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="700"
          fontSize={18}
          color={TEXT_INTERFACE}
        >
          {isNewUser
            ? 'Or just browse a century of data'
            : 'Explore player statistics'}
        </Text>
        <Text fontFamily={BODY_FONT} fontSize={14} color={TEXT_SECONDARY}>
          {isNewUser
            ? 'Not ready to commit to a league yet? Every box score since 1876 is here to read.'
            : 'Every recorded at-bat since 1876. Filter by era, team, or the night a record fell.'}
        </Text>
      </YStack>
      <ActionButton
        label="View All Stats"
        variant="outline"
        onPress={onPress}
      />
    </XStack>
  );
}

/* ─── Mock draft CTA ─── */

function MockDraftCta({ onPress }: { onPress: () => void }) {
  return (
    <XStack
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={24}
      padding={28}
      gap="$4"
      alignItems="center"
      flexWrap="wrap"
    >
      <YStack
        width={64}
        height={64}
        borderRadius={12}
        backgroundColor={withAlpha(BRAND_NAVY, 0.35)}
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.45)}
        alignItems="center"
        justifyContent="center"
      >
        <BrandIcon
          name="draft"
          size={36}
          decorative={false}
          title="Mock draft"
        />
      </YStack>
      <YStack flex={1} minWidth={200} gap="$1">
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="700"
          fontSize={18}
          color={TEXT_INTERFACE}
        >
          See who falls to your pick.
        </Text>
        <Text fontFamily={BODY_FONT} fontSize={14} color={TEXT_SECONDARY}>
          Run a 12-team snake against bots in under ten minutes. Once you join a
          real league, mocks pull from that league&apos;s exact era and ruleset.
        </Text>
      </YStack>
      <ActionButton label="Start Mock Draft" variant="navy" onPress={onPress} />
    </XStack>
  );
}

/* ─── Greeting header ─── */

function GreetingHeader({
  userName,
  children,
}: {
  userName: string;
  children?: React.ReactNode;
}) {
  return (
    <YStack
      paddingBottom={24}
      borderBottomWidth={1}
      borderBottomColor={PANEL_BORDER}
      gap="$2"
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1.6}
        textTransform="uppercase"
        color={BRAND_GOLD_LIGHT}
      >
        Welcome back
      </Text>
      <H1
        testID="home-greeting-name"
        margin={0}
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={44}
        lineHeight={46}
        color={WHITE}
      >
        {userName}
      </H1>
      {children}
    </YStack>
  );
}

/* ─── Panel wrapper for the On This Day rail/section ─── */

function OnThisDayPanel({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={16}
      padding={22}
      gap="$3"
    >
      {children}
    </YStack>
  );
}

/* ─── Premium empty-state CTAs ─── */

function PremiumEmptyStateCtas({
  onCreateSalaryCapLeague,
  onCreateAuctionLeague,
}: {
  onCreateSalaryCapLeague?: () => void;
  onCreateAuctionLeague?: () => void;
}) {
  return (
    <YStack
      testID="home-premium-empty-ctas"
      backgroundColor={withAlpha(BRAND_GOLD, 0.07)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.28)}
      borderRadius={16}
      padding={22}
      gap="$3"
    >
      <XStack alignItems="center" gap="$2">
        <XStack
          backgroundColor={withAlpha(BRAND_GOLD, 0.16)}
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.4)}
          borderRadius={9999}
          paddingVertical={4}
          paddingHorizontal={10}
        >
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={10}
            letterSpacing={1.4}
            textTransform="uppercase"
            color={BRAND_GOLD_LIGHT}
          >
            Premium
          </Text>
        </XStack>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="700"
          fontSize={15}
          color={TEXT_INTERFACE}
        >
          Exclusive league types unlocked
        </Text>
      </XStack>
      <Text fontFamily={BODY_FONT} fontSize={14} color={TEXT_SECONDARY}>
        Your subscription unlocks salary cap enforcement and auction drafts —
        the most competitive formats in the archive.
      </Text>
      <XStack gap="$2" flexWrap="wrap" marginTop="$1">
        {onCreateSalaryCapLeague ? (
          <ActionButton
            label="Create Salary Cap League"
            variant="gold"
            onPress={onCreateSalaryCapLeague}
            testID="home-premium-salary-cap-cta"
          />
        ) : null}
        {onCreateAuctionLeague ? (
          <ActionButton
            label="Try Auction Draft"
            variant="outline"
            onPress={onCreateAuctionLeague}
            testID="home-premium-auction-cta"
          />
        ) : null}
      </XStack>
    </YStack>
  );
}

/* ─── HomeScreen ─── */

/**
 * Cross-platform authenticated home dashboard, shared by web and mobile.
 *
 * Purely presentational: callers supply data (`leagues`, `archivedLeagues`,
 * `onThisDay`) and navigation callbacks. Renders one of: loading, error,
 * returning-user dashboard, or new-user getting-started view.
 */
export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  const {
    userName = 'Manager',
    leagues = [],
    archivedLeagues = [],
    archivedCount = null,
    userStats,
    onThisDay,
    defaultSport = 'baseball',
    isLight = false,
    isPremium = false,
    loading = false,
    error = false,
    showArchived = false,
    archivedLoading = false,
    onShowArchived,
    onRetry,
    onViewLeague,
    onSetLineup,
    onMockDraft,
    onCreateLeague,
    onJoinLeague,
    onBrowseStats,
    onViewSport,
    onStartMockDraft,
    onHowItWorks,
    onCreateSalaryCapLeague,
    onCreateAuctionLeague,
  } = props;

  const sortedSummaries = useMemo(() => sortByUrgency(leagues), [leagues]);
  const hasLeagues = sortedSummaries.length > 0;

  const orderedSports = useMemo(
    () =>
      defaultSport === 'baseball'
        ? SPORTS
        : [...SPORTS].sort((a, b) => {
            if (a.key === defaultSport) return -1;
            if (b.key === defaultSport) return 1;
            return 0;
          }),
    [defaultSport],
  );

  const derivedStats = useMemo<HomeUserStats>(() => {
    if (userStats) return userStats;
    const active = sortedSummaries.filter((s) => s.leaguePhase === 'active');
    const wins = active.reduce((a, s) => a + (s.wins ?? 0), 0);
    const losses = active.reduce((a, s) => a + (s.losses ?? 0), 0);
    const ties = active.reduce((a, s) => a + (s.ties ?? 0), 0);
    const aggregateRecord =
      active.length > 0
        ? ties > 0
          ? `${wins}-${losses}-${ties}`
          : `${wins}-${losses}`
        : null;
    return {
      leagueCount: sortedSummaries.length,
      aggregateRecord,
      firstPlaceCount: sortedSummaries.filter((s) => s.rank === 1).length,
    };
  }, [userStats, sortedSummaries]);

  /* ── Loading ── */
  if (loading) {
    return (
      <ScrollView testID="home-screen" backgroundColor="$background">
        <YStack
          flex={1}
          minHeight={400}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          gap="$4"
        >
          <Spinner size="large" color={BRAND_GOLD_LIGHT} />
          <Text fontFamily={BODY_FONT} color={TEXT_SECONDARY}>
            Loading your dashboard…
          </Text>
        </YStack>
      </ScrollView>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <ScrollView testID="home-screen" backgroundColor="$background">
        <YStack
          maxWidth={1280}
          width="100%"
          alignSelf="center"
          padding="$5"
          gap="$6"
        >
          <GreetingHeader userName={userName} />
          <YStack
            testID="home-error"
            backgroundColor={SURFACE_PANEL}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.35)}
            borderRadius={20}
            padding={32}
            gap="$3"
          >
            <H2
              margin={0}
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={26}
              color={TEXT_INTERFACE}
            >
              Unable to load your leagues
            </H2>
            <Text fontFamily={BODY_FONT} fontSize={15} color={TEXT_SECONDARY}>
              We couldn&apos;t reach the league server. Your standings and
              matchups are safe — this is a display issue only.
            </Text>
            {onRetry ? (
              <XStack marginTop="$2">
                <ActionButton
                  label="Retry"
                  variant="navy"
                  onPress={onRetry}
                  testID="home-error-retry"
                />
              </XStack>
            ) : null}
          </YStack>
          {onThisDay ? (
            <YStack gap="$4">
              <SectionHead
                eyebrow="Still here"
                title="On This Day in Baseball"
              />
              <OnThisDayPanel>{onThisDay}</OnThisDayPanel>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>
    );
  }

  /* ── Returning-user dashboard ── */
  if (hasLeagues) {
    const heroLeague = sortedSummaries[0];
    const secondaryLeagues = sortedSummaries.slice(1);

    return (
      <ScrollView testID="home-screen" backgroundColor="$background">
        <YStack
          testID="home-content"
          maxWidth={1280}
          width="100%"
          alignSelf="center"
          padding="$5"
          gap="$6"
        >
          <GreetingHeader userName={userName}>
            <XStack gap="$2" flexWrap="wrap" alignItems="center" marginTop="$1">
              <Text
                fontFamily={DISPLAY_FONT}
                fontWeight="700"
                fontSize={14}
                letterSpacing={1}
                textTransform="uppercase"
                color={TEXT_SECONDARY}
                fontVariant={['tabular-nums']}
              >
                {derivedStats.leagueCount}{' '}
                {derivedStats.leagueCount === 1 ? 'league' : 'leagues'}
              </Text>
              {derivedStats.aggregateRecord ? (
                <Text
                  fontFamily={DISPLAY_FONT}
                  fontWeight="700"
                  fontSize={14}
                  letterSpacing={1}
                  textTransform="uppercase"
                  color={TEXT_SECONDARY}
                  fontVariant={['tabular-nums']}
                >
                  · Overall {derivedStats.aggregateRecord}
                </Text>
              ) : null}
              {derivedStats.firstPlaceCount &&
              derivedStats.firstPlaceCount > 0 ? (
                <Text
                  fontFamily={DISPLAY_FONT}
                  fontWeight="700"
                  fontSize={14}
                  letterSpacing={1}
                  textTransform="uppercase"
                  color={TEXT_SECONDARY}
                  fontVariant={['tabular-nums']}
                >
                  · {derivedStats.firstPlaceCount} first place
                </Text>
              ) : null}
            </XStack>
          </GreetingHeader>

          <YStack
            gap="$6"
            $gtMd={{ flexDirection: 'row', alignItems: 'flex-start' }}
          >
            {/* Main column */}
            <YStack flex={1} gap="$8" minWidth={0}>
              <YStack gap="$5">
                <SectionHead eyebrow="Active Season" title="Your Leagues" />
                <LeagueHeroCard
                  summary={heroLeague}
                  onPress={() => onViewLeague(heroLeague)}
                  onSetLineup={
                    onSetLineup ? () => onSetLineup(heroLeague) : undefined
                  }
                />
                {secondaryLeagues.length > 0 ? (
                  <YStack
                    borderWidth={1}
                    borderColor={PANEL_BORDER}
                    borderRadius={12}
                    overflow="hidden"
                    gap={1}
                    backgroundColor={PANEL_BORDER}
                  >
                    {secondaryLeagues.map((s) => (
                      <LeagueListRow
                        key={s.leagueId}
                        summary={s}
                        onPress={() => onViewLeague(s)}
                        onMockDraft={
                          onMockDraft ? () => onMockDraft(s) : undefined
                        }
                      />
                    ))}
                  </YStack>
                ) : null}

                {!showArchived ? (
                  onShowArchived ? (
                    <XStack
                      testID="home-show-archived"
                      accessibilityRole="button"
                      accessibilityLabel={
                        archivedCount != null
                          ? `Show ${archivedCount} archived ${archivedCount === 1 ? 'league' : 'leagues'}`
                          : 'Show archived leagues'
                      }
                      onPress={onShowArchived}
                      alignSelf="flex-start"
                      borderWidth={1}
                      borderColor={PANEL_BORDER}
                      borderStyle="dashed"
                      borderRadius={9999}
                      paddingVertical={10}
                      paddingHorizontal={16}
                      cursor="pointer"
                      hoverStyle={{ borderColor: BORDER_STRONG }}
                    >
                      <Text
                        fontFamily={DISPLAY_FONT}
                        fontWeight="700"
                        fontSize={12}
                        letterSpacing={1.1}
                        textTransform="uppercase"
                        color={TEXT_SECONDARY}
                      >
                        {archivedCount != null
                          ? `Show ${archivedCount} archived ${archivedCount === 1 ? 'league' : 'leagues'}`
                          : 'Show archived leagues'}
                      </Text>
                    </XStack>
                  ) : null
                ) : archivedLoading ? (
                  <XStack gap="$2" alignItems="center">
                    <Spinner size="small" color={BRAND_GOLD_LIGHT} />
                    <Text
                      fontFamily={BODY_FONT}
                      fontSize={13}
                      color={TEXT_SECONDARY}
                    >
                      Loading archived leagues…
                    </Text>
                  </XStack>
                ) : archivedLeagues.length > 0 ? (
                  <YStack gap="$3">
                    <Text
                      fontFamily={DISPLAY_FONT}
                      fontWeight="700"
                      fontSize={14}
                      letterSpacing={1.1}
                      textTransform="uppercase"
                      color={TEXT_SECONDARY}
                    >
                      Archived
                    </Text>
                    <YStack
                      borderWidth={1}
                      borderColor={PANEL_BORDER}
                      borderRadius={12}
                      overflow="hidden"
                      gap={1}
                      backgroundColor={PANEL_BORDER}
                    >
                      {archivedLeagues.map((s) => (
                        <LeagueListRow
                          key={s.leagueId}
                          summary={s}
                          onPress={() => onViewLeague(s)}
                          onMockDraft={
                            onMockDraft ? () => onMockDraft(s) : undefined
                          }
                        />
                      ))}
                    </YStack>
                  </YStack>
                ) : null}
              </YStack>

              <YStack gap="$5">
                <SectionHead eyebrow="Your Sports" title="Pick your sport" />
                <YStack gap="$4" $gtSm={{ flexDirection: 'row' }}>
                  {SPORTS.map((sport) => (
                    <SportCard
                      key={sport.key}
                      sport={sport}
                      isLight={isLight}
                      onView={() => onViewSport(sport.key)}
                      onCreate={onCreateLeague}
                    />
                  ))}
                </YStack>
              </YStack>

              <StatsCta onPress={onBrowseStats} />
            </YStack>

            {/* Right rail */}
            {onThisDay ? (
              <YStack width="100%" $gtMd={{ width: 360 }}>
                <OnThisDayPanel>{onThisDay}</OnThisDayPanel>
              </YStack>
            ) : null}
          </YStack>
        </YStack>
      </ScrollView>
    );
  }

  /* ── New-user getting-started view ── */
  return (
    <ScrollView testID="home-screen" backgroundColor="$background">
      <YStack
        testID="home-content"
        maxWidth={1280}
        width="100%"
        alignSelf="center"
        padding="$5"
        gap="$8"
      >
        <YStack
          paddingBottom={32}
          borderBottomWidth={1}
          borderBottomColor={PANEL_BORDER}
          gap="$4"
        >
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={12}
            letterSpacing={1.6}
            textTransform="uppercase"
            color={BRAND_GOLD_LIGHT}
          >
            Welcome, {userName}
          </Text>
          <H1
            margin={0}
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={48}
            lineHeight={48}
            color={WHITE}
          >
            Start your dynasty.
          </H1>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={48}
            lineHeight={48}
            color={BRAND_GOLD_LIGHT}
          >
            Draft legends across every era.
          </Text>
          <Text
            fontFamily={BODY_FONT}
            fontSize={18}
            lineHeight={28}
            color={TEXT_SECONDARY}
          >
            Create a league in sixty seconds. Invite ten friends, pick an era,
            and compete on real archived statistics — from Deadball to today.
          </Text>
          <XStack gap="$2" flexWrap="wrap" marginTop="$2">
            <ActionButton
              label="Create League"
              variant="gold"
              onPress={onCreateLeague}
              testID="home-empty-create"
            />
            <ActionButton
              label="Join League"
              variant="navy"
              onPress={onJoinLeague}
              testID="home-empty-join"
            />
            {onHowItWorks ? (
              <ActionButton
                label="How It Works"
                variant="outline"
                onPress={onHowItWorks}
              />
            ) : null}
          </XStack>
          {isPremium && (onCreateSalaryCapLeague || onCreateAuctionLeague) ? (
            <PremiumEmptyStateCtas
              onCreateSalaryCapLeague={onCreateSalaryCapLeague}
              onCreateAuctionLeague={onCreateAuctionLeague}
            />
          ) : null}
        </YStack>

        <YStack gap="$5">
          <SectionHead eyebrow="Step one" title="Choose your sport" />
          <YStack gap="$4" $gtSm={{ flexDirection: 'row' }}>
            {orderedSports.map((sport) => (
              <SportCard
                key={sport.key}
                sport={sport}
                isLight={isLight}
                full
                onView={() => onViewSport(sport.key)}
                onCreate={onCreateLeague}
              />
            ))}
          </YStack>
        </YStack>

        {defaultSport === 'baseball' && onThisDay ? (
          <YStack gap="$5">
            <SectionHead
              eyebrow="Try the archive"
              title="On This Day in Baseball"
            />
            <OnThisDayPanel>{onThisDay}</OnThisDayPanel>
          </YStack>
        ) : null}

        {onStartMockDraft ? (
          <YStack gap="$5">
            <SectionHead eyebrow="Scout the room" title="Try a mock draft" />
            <MockDraftCta onPress={onStartMockDraft} />
          </YStack>
        ) : null}

        <StatsCta onPress={onBrowseStats} isNewUser />
      </YStack>
    </ScrollView>
  );
}

export default HomeScreen;
