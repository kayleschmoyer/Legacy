/**
 * MobileHomeScreen — the compact, game-day-first "Scoreboard First" Home
 * layout for mobile (LS-8794).
 *
 * Deliberately a *fork* of `HomeScreen` rather than a branch inside it: the
 * web dashboard renders through `HomeScreen` untouched, so this file cannot
 * regress it. Loading, error and new-user states are delegated straight back
 * to `HomeScreen` — only the returning-user state is redesigned.
 *
 * Order: greeting → live matchup ticker → league rail → quick actions →
 * condensed On This Day.
 */
import React, { useMemo } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import type { RefreshControlProps } from 'react-native';
import { ChevronRight, Plus, TrendingUp, Users } from '@tamagui/lucide-icons';
import { formatDraftDate } from '@legacy-sports/utils';
import {
  type HomeLeagueSummary,
  HomeScreen,
  type HomeScreenProps,
} from './HomeScreen';
import {
  formatEraDescriptor,
  formatMatchupCloses,
} from './homeSummaryFormatters';
import { recordOf, safeScore, sortByUrgency } from './leagueSummaryStats';
import { BODY_FONT, DISPLAY_FONT } from './homeFonts';
import { GradientSurface } from './GradientSurface';
import { BrandIcon } from '../../components/icons';
import { useThemeTokens } from '../../hooks/useThemeTokens';

/* ─── Layout constants ─── */

/** Page gutter — the design's 16–20px range. */
const PAGE_PADDING = 18;
const CARD_WIDTH = 250;
const CARD_HEIGHT = 172;
const CARD_GAP = 12;
const AVATAR_SIZE = 40;
/** Live-ticker card corner radius and hairline border. */
const TICKER_RADIUS = 16;
const TICKER_BORDER = 1;
/**
 * Radius of the ticker's *inner* top corners — the gradient header sits inside
 * the card's 1px border, so it needs a slightly tighter radius to sit flush.
 */
const TICKER_HEADER_RADIUS = TICKER_RADIUS - TICKER_BORDER;

/**
 * Top padding for the scroll content: the page gutter plus the full top
 * safe-area inset, so the greeting always clears the status bar (LS-8808
 * defect 3, a mobile-fork regression of LS-8625).
 *
 * Applied to the scroll *content* rather than to the `ScrollView`'s own style:
 * padding set on a Tamagui/RN `ScrollView` pads the scroll container, which
 * does not reliably inset the content on Android. Non-finite or negative
 * insets are ignored so a missing safe-area provider degrades to the gutter
 * rather than collapsing or inflating the layout.
 */
export function homeContentTopPadding(topInset: number): number {
  return (
    PAGE_PADDING + (Number.isFinite(topInset) && topInset > 0 ? topInset : 0)
  );
}

/* ─── Public types ─── */

export interface MobileHomeScreenProps extends HomeScreenProps {
  /** Navigates to the Leagues tab — the rail's "See all ›" control. */
  onSeeAllLeagues?: () => void;
  /** Navigates to the You tab — the greeting avatar. */
  onOpenProfile?: () => void;
  /**
   * Opens the live matchup — the ticker's MATCHUP button. Falls back to
   * `onViewLeague` when not supplied.
   */
  onViewMatchup?: (summary: HomeLeagueSummary) => void;
  /**
   * Condensed On This Day node for the compact layout. Falls back to
   * `onThisDay`, which is also what the delegated states render.
   */
  onThisDayCondensed?: React.ReactNode;
  /**
   * Pull-to-refresh control for the returning-user layout's `ScrollView`
   * (LS-8847). Not forwarded to the delegated loading/error/new-user states —
   * those come from the shared `HomeScreen`, which stays unchanged for web.
   */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

/* ─── Small shared bits ─── */

function Eyebrow({
  children,
  color = '$textMuted',
  testID,
}: {
  children: React.ReactNode;
  color?: string;
  testID?: string;
}) {
  return (
    <Text
      testID={testID}
      fontFamily={DISPLAY_FONT}
      fontWeight="700"
      fontSize={11}
      letterSpacing={1.6}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

/** "See all ›" / "More ›" style affordance. */
function LinkAction({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  if (!onPress) return null;
  return (
    <XStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      alignItems="center"
      gap="$1"
      cursor="pointer"
      hitSlop={8}
      pressStyle={{ opacity: 0.7 }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1.1}
        textTransform="uppercase"
        color="$textMuted"
      >
        {label}
      </Text>
      <ChevronRight size={14} color="$textMuted" />
    </XStack>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$2">
      <XStack alignItems="center" gap="$1">
        <Eyebrow>{title}</Eyebrow>
        {count != null ? (
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.6}
            color="$brandGoldLight"
            fontVariant={['tabular-nums']}
          >
            {`· ${count}`}
          </Text>
        ) : null}
      </XStack>
      {action}
    </XStack>
  );
}

/** Compact uppercase pill button used by the live ticker. */
function TickerButton({
  label,
  onPress,
  variant,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant: 'gold' | 'outline';
  testID?: string;
}) {
  const isGold = variant === 'gold';
  return (
    <XStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingVertical={9}
      borderRadius={10}
      borderWidth={1}
      backgroundColor={isGold ? '$brandGold' : 'transparent'}
      borderColor={isGold ? '$brandGold' : '$outlineStrong'}
      cursor="pointer"
      pressStyle={{ opacity: 0.8 }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1.1}
        textTransform="uppercase"
        color={isGold ? '$textOnGold' : '$color'}
      >
        {label}
      </Text>
    </XStack>
  );
}

/* ─── Greeting row ─── */

function GreetingRow({
  userName,
  onOpenProfile,
}: {
  userName: string;
  onOpenProfile?: () => void;
}) {
  const { brand } = useThemeTokens();
  const initial = userName.trim().charAt(0).toUpperCase() || 'M';

  return (
    <XStack testID="home-greeting" alignItems="center" gap="$3">
      <YStack flex={1} gap="$1" minWidth={0}>
        <Eyebrow color="$brandGoldLight">Welcome back</Eyebrow>
        <Text
          testID="home-greeting-name"
          fontFamily={DISPLAY_FONT}
          fontWeight="900"
          fontSize={24}
          lineHeight={27}
          color="$color"
          numberOfLines={1}
        >
          {userName}
        </Text>
      </YStack>
      <GradientSurface
        testID="home-profile-avatar"
        accessibilityRole="button"
        accessibilityLabel="Open your profile"
        onPress={onOpenProfile}
        colors={[brand.navy, brand.gold]}
        angle={135}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        borderRadius={9999}
        overflow="hidden"
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        pressStyle={{ opacity: 0.85 }}
      >
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={16}
          color="$textOnAccent"
        >
          {initial}
        </Text>
      </GradientSurface>
    </XStack>
  );
}

/* ─── Live matchup ticker ─── */

function LiveMatchupTicker({
  summary,
  onSetLineup,
  onViewMatchup,
}: {
  summary: HomeLeagueSummary;
  onSetLineup?: () => void;
  onViewMatchup?: () => void;
}) {
  const { brand } = useThemeTokens();

  const userScore = safeScore(summary.userScore);
  const oppScore = safeScore(summary.opponentScore);
  // Leader-gold logic mirrors HeroRightPanel: ties read as the user leading.
  const isLeading = userScore >= oppScore;

  const closes = formatMatchupCloses(summary.matchupEndTime);
  const week = summary.currentWeekNumber;
  const totalWeeks = summary.totalMatchups;
  const progress =
    week != null && totalWeeks != null && totalWeeks > 0
      ? Math.min(1, Math.max(0, week / totalWeeks))
      : 0;

  return (
    <YStack
      testID="home-live-ticker"
      borderRadius={TICKER_RADIUS}
      borderWidth={TICKER_BORDER}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfacePanel"
      overflow="hidden"
    >
      {/* The header rounds its own top corners rather than relying on the
          card's `overflow: 'hidden'` — Android does not reliably clip a
          non-background child to its parent's border radius (LS-8808). */}
      <GradientSurface
        testID="home-live-ticker-header"
        colors={[brand.seamRed, brand.seamRedDark]}
        angle={90}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
        paddingVertical={8}
        paddingHorizontal={14}
        borderTopLeftRadius={TICKER_HEADER_RADIUS}
        borderTopRightRadius={TICKER_HEADER_RADIUS}
      >
        <XStack alignItems="center" gap="$2">
          <YStack
            testID="home-live-dot"
            width={7}
            height={7}
            borderRadius={9999}
            backgroundColor="$statusSuccessFg"
          />
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$textOnAccent"
            fontVariant={['tabular-nums']}
          >
            {week != null ? `Live · Week ${week}` : 'Live'}
          </Text>
        </XStack>
        {closes ? (
          <Text
            fontFamily={BODY_FONT}
            fontSize={11}
            color="$textOnAccent"
            fontVariant={['tabular-nums']}
            numberOfLines={1}
          >
            {`Closes ${closes}`}
          </Text>
        ) : null}
      </GradientSurface>

      <YStack padding={14} gap="$3">
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <YStack flex={1} gap="$1" minWidth={0}>
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.1}
              textTransform="uppercase"
              color="$textMuted"
              numberOfLines={1}
            >
              My Team
            </Text>
            <Text
              testID="home-ticker-user-score"
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={30}
              lineHeight={32}
              color={isLeading ? '$brandGoldLight' : '$color'}
              fontVariant={['tabular-nums']}
            >
              {userScore.toFixed(1)}
            </Text>
          </YStack>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={12}
            letterSpacing={2.5}
            color="$textMuted"
          >
            VS
          </Text>
          <YStack flex={1} gap="$1" minWidth={0} alignItems="flex-end">
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.1}
              textTransform="uppercase"
              color="$textMuted"
              numberOfLines={1}
            >
              {summary.opponentTeamName ?? 'Opponent'}
            </Text>
            <Text
              testID="home-ticker-opponent-score"
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={30}
              lineHeight={32}
              color={!isLeading ? '$brandGoldLight' : '$color'}
              fontVariant={['tabular-nums']}
            >
              {oppScore.toFixed(1)}
            </Text>
          </YStack>
        </XStack>

        <YStack
          testID="home-ticker-progress"
          height={4}
          borderRadius={9999}
          backgroundColor="$surfaceInteractive"
          overflow="hidden"
        >
          <GradientSurface
            colors={[brand.gold, brand.goldLight]}
            angle={90}
            width={`${progress * 100}%`}
            height={4}
            borderRadius={9999}
          />
        </YStack>

        <XStack gap="$2">
          <TickerButton
            label="Set Lineup"
            variant="gold"
            onPress={onSetLineup}
            testID="home-ticker-set-lineup"
          />
          <TickerButton
            label="Matchup"
            variant="outline"
            onPress={onViewMatchup}
            testID="home-ticker-matchup"
          />
        </XStack>
      </YStack>
    </YStack>
  );
}

/* ─── League rail card ─── */

/** "Live" / "Active" / "Draft · Apr 12" status line for a rail card. */
function statusLineFor(summary: HomeLeagueSummary): string {
  if (summary.draftStatus === 'in-progress') return 'Draft Live';
  if (summary.matchupStatus === 'in_progress') return 'Live';
  if (summary.leaguePhase === 'active') return 'Active';
  if (summary.leaguePhase === 'pre-draft') {
    return summary.draftScheduledAt
      ? `Draft · ${formatDraftDate(summary.draftScheduledAt)}`
      : 'Draft';
  }
  return 'Offseason';
}

function CardStat({ value, label }: { value: string; label: string }) {
  return (
    <YStack gap="$1" minWidth={0} flex={1}>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={20}
        lineHeight={22}
        color="$color"
        fontVariant={['tabular-nums']}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={10}
        letterSpacing={1.1}
        textTransform="uppercase"
        color="$textMuted"
        numberOfLines={1}
      >
        {label}
      </Text>
    </YStack>
  );
}

function LeagueRailCard({
  summary,
  onPress,
}: {
  summary: HomeLeagueSummary;
  onPress: () => void;
}) {
  const name = summary.leagueName ?? 'League';
  const era = formatEraDescriptor(summary);
  const descriptor = [era, summary.isCommissioner ? 'Commissioner' : null]
    .filter(Boolean)
    .join(' · ');
  const isLive =
    summary.draftStatus === 'in-progress' ||
    summary.matchupStatus === 'in_progress';

  return (
    <YStack
      testID={`home-league-card-${summary.leagueId ?? 'unknown'}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      borderRadius={16}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfaceCard"
      padding={16}
      gap="$1"
      cursor="pointer"
      pressStyle={{ opacity: 0.85 }}
    >
      <Eyebrow color={isLive ? '$brandSeamRedLight' : '$textMuted'}>
        {statusLineFor(summary)}
      </Eyebrow>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={20}
        lineHeight={23}
        color="$color"
        numberOfLines={2}
      >
        {name}
      </Text>
      {descriptor ? (
        <Text
          fontFamily={BODY_FONT}
          fontSize={12}
          color="$textMuted"
          numberOfLines={1}
        >
          {descriptor}
        </Text>
      ) : null}
      {/* `marginTop: auto` anchors the stat row to the card floor, so every
          card in the rail shares one stat baseline regardless of how many
          lines the name and era descriptor take. */}
      <XStack marginTop="auto" gap="$3" alignItems="flex-end">
        <CardStat value={recordOf(summary)} label="Record" />
        {summary.rank != null && summary.totalTeams != null ? (
          <CardStat
            value={`#${summary.rank}`}
            label={`of ${summary.totalTeams}`}
          />
        ) : (
          <CardStat value={`${summary.teamCount ?? 0}`} label="Teams" />
        )}
      </XStack>
    </YStack>
  );
}

/* ─── Quick actions ─── */

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <YStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      opacity={disabled ? 0.45 : 1}
      flex={1}
      minWidth={0}
      gap="$2"
      paddingVertical={14}
      paddingHorizontal={14}
      borderRadius={14}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfacePanel"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      pressStyle={disabled ? undefined : { opacity: 0.85 }}
    >
      {icon}
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={12}
        letterSpacing={1.1}
        textTransform="uppercase"
        color="$color"
        numberOfLines={1}
      >
        {label}
      </Text>
    </YStack>
  );
}

/* ─── MobileHomeScreen ─── */

export function MobileHomeScreen(
  props: MobileHomeScreenProps,
): React.JSX.Element {
  const {
    userName = 'Manager',
    leagues = [],
    topInset = 0,
    loading = false,
    error = false,
    onThisDay,
    onThisDayCondensed,
    onSeeAllLeagues,
    onOpenProfile,
    onViewMatchup,
    onViewLeague,
    onSetLineup,
    onCreateLeague,
    onJoinLeague,
    onBrowseStats,
    onStartMockDraft,
    mockDraftAtCap,
    refreshControl,
  } = props;

  const sorted = useMemo(() => sortByUrgency(leagues), [leagues]);
  // Most-urgent league with a live matchup; `sorted` is already urgency-ordered.
  const liveMatchup = useMemo(
    () => sorted.find((s) => s.matchupStatus === 'in_progress') ?? null,
    [sorted],
  );

  // Loading, error and new-user states are explicitly out of scope for the
  // redesign — delegate them to the shared HomeScreen so they stay identical.
  if (loading || error || sorted.length === 0) {
    return <HomeScreen {...props} />;
  }

  const onThisDayNode = onThisDayCondensed ?? onThisDay;

  return (
    <ScrollView
      testID="home-screen"
      backgroundColor="$background"
      refreshControl={refreshControl}
    >
      <YStack
        testID="home-content"
        width="100%"
        paddingTop={homeContentTopPadding(topInset)}
        paddingHorizontal={PAGE_PADDING}
        paddingBottom={PAGE_PADDING}
        gap="$5"
      >
        <GreetingRow userName={userName} onOpenProfile={onOpenProfile} />

        {liveMatchup ? (
          <LiveMatchupTicker
            summary={liveMatchup}
            onSetLineup={
              onSetLineup ? () => onSetLineup(liveMatchup) : undefined
            }
            onViewMatchup={() =>
              onViewMatchup
                ? onViewMatchup(liveMatchup)
                : onViewLeague(liveMatchup)
            }
          />
        ) : null}

        <YStack gap="$3">
          <SectionHeader
            title="Your Leagues"
            count={sorted.length}
            action={
              <LinkAction
                label="See all"
                onPress={onSeeAllLeagues}
                testID="home-see-all-leagues"
              />
            }
          />
          {/* Full-bleed rail: the viewport escapes the page gutter so the
              trailing card peeks off the physical screen edge — a deliberate
              "scroll for more" affordance — instead of being sliced by a hard
              vertical line one gutter in (LS-8808 defect 4). The gutter moves
              onto the content, so cards stay gutter-aligned at every snap. */}
          <ScrollView
            testID="home-league-rail"
            horizontal
            marginHorizontal={-PAGE_PADDING}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            snapToAlignment="start"
            decelerationRate="fast"
          >
            <XStack gap={CARD_GAP} paddingHorizontal={PAGE_PADDING}>
              {sorted.map((summary) => (
                <LeagueRailCard
                  key={summary.leagueId}
                  summary={summary}
                  onPress={() => onViewLeague(summary)}
                />
              ))}
            </XStack>
          </ScrollView>
        </YStack>

        <YStack testID="home-quick-actions" gap="$3">
          <SectionHeader title="Quick Actions" />
          <XStack gap="$3">
            <QuickAction
              testID="home-quick-create-league"
              icon={<Plus size={20} color="$brandGoldLight" />}
              label="Create League"
              onPress={onCreateLeague}
            />
            <QuickAction
              testID="home-quick-join-league"
              icon={<Users size={20} color="$brandGoldLight" />}
              label="Join League"
              onPress={onJoinLeague}
            />
          </XStack>
          <XStack gap="$3">
            <QuickAction
              testID="home-quick-mock-draft"
              icon={
                <BrandIcon
                  name="draft"
                  size={20}
                  decorative={false}
                  title="Mock draft"
                />
              }
              label="Mock Draft"
              onPress={onStartMockDraft}
              disabled={mockDraftAtCap}
            />
            <QuickAction
              testID="home-quick-browse-stats"
              icon={<TrendingUp size={20} color="$brandGoldLight" />}
              label="Browse Stats"
              onPress={onBrowseStats}
            />
          </XStack>
        </YStack>

        {onThisDayNode ? (
          <YStack testID="home-on-this-day" gap="$3">
            {onThisDayNode}
          </YStack>
        ) : null}
      </YStack>
    </ScrollView>
  );
}

export default MobileHomeScreen;
