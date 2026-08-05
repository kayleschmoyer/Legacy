import React, { useMemo, useState } from 'react';
import { H1, H2, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { ArrowRight } from '@tamagui/lucide-icons';
import { formatDraftDate } from '@legacy-sports/utils';
// Football playboard-hero palette (LS-9035) — theme-invariant physical-object
// colors, sourced from the sanctioned unscanned palette home so they never
// count against the theme-compliance ratchet (LS-8519). See the
// `playboardTokens` doc comment in tamagui-config.ts.
import { playboardTokens } from '@legacy-sports/tamagui-config';
import {
  formatEraDescriptor,
  formatEraYears,
  formatMatchupCloses,
} from './homeSummaryFormatters';
import {
  deriveHomeUserStats,
  type HomeLeagueSummary,
  type HomeUserStats,
  recordOf,
  safeScore,
  sortByUrgency,
} from './leagueSummaryStats';
import { BODY_FONT, DISPLAY_FONT } from './homeFonts';
import { GradientSurface } from './GradientSurface';
import { BrandIcon, type BrandIconName } from '../../components/icons';
import {
  AMBER_WARM,
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  GREEN,
  GREEN_DEEP,
  GREEN_LIGHTER,
  OVERLAY_BLACK_40,
  OVERLAY_BLACK_50,
  SCORE_LOSS,
  TEXT_TERTIARY,
  TICKET_INK,
  TICKET_INK_SOFT,
  TICKET_INK_TRAIL,
  TICKET_RULE,
  TICKET_STOCK,
  TICKET_STOCK_2,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// Re-export the shared display-name formatter so app wrappers can reuse it.
export { formatDisplayName } from './homeSummaryFormatters';

// The league-summary types moved to `leagueSummaryStats` (LS-8795) so the
// Leagues ledger can consume them without importing this component module.
// Re-exported here to keep `@legacy-sports/shared-components` imports stable.
export type { HomeLeagueSummary, HomeUserStats } from './leagueSummaryStats';

/* ─── Public types ─── */

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
  /** Top safe-area inset (e.g. from `useSafeAreaInsets().top`), applied as top padding so content never renders under the status bar. Defaults to 0 for platforms without a safe-area concept (web). */
  topInset?: number;

  loading?: boolean;
  error?: boolean;
  showArchived?: boolean;
  archivedLoading?: boolean;

  onShowArchived?: () => void;
  /** Collapses the archived-leagues section back behind the "show archived" toggle. */
  onHideArchived?: () => void;
  onRetry?: () => void;
  onViewLeague: (summary: HomeLeagueSummary) => void;
  onSetLineup?: (summary: HomeLeagueSummary) => void;
  onMockDraft?: (summary: HomeLeagueSummary) => void;
  onCreateLeague: () => void;
  onJoinLeague: () => void;
  onBrowseStats: () => void;
  onViewSport: (sportKey: 'baseball' | 'football') => void;
  onStartMockDraft?: () => void;
  /** When true, the mock-draft CTA button is disabled (free user at weekly cap). */
  mockDraftAtCap?: boolean;
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
    // LS-9035: football's Home dashboard gating is live — the playboard hero
    // and this card both reflect it now. Other football "Coming Soon" gates
    // elsewhere in the app (landing page, mock draft setup, Commish tab) are
    // out of this ticket's target files and are tracked separately.
    available: true,
  },
];

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
        color="$color"
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
      color: '$color',
      border: '$outlineStrong',
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

/* ─── Ticket-stock hero card (LS-9034) ───
   Baseball hero replaces the dark league-hero panel with a printed-ticket
   motif: a cream-stock card carrying league identity + score, plus a
   perforated stub. Dark-on-light ink tokens only — never the dark-theme
   `$color`/`$textMuted` tokens used elsewhere in this file. */

function TicketButton({
  label,
  onPress,
  variant,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant: 'solid' | 'outline';
  testID?: string;
}) {
  const isSolid = variant === 'solid';
  return (
    <XStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      cursor="pointer"
      minHeight={44}
      paddingVertical={12}
      paddingHorizontal={18}
      borderRadius={4}
      borderWidth={1}
      borderColor={isSolid ? BRAND_NAVY : withAlpha(TICKET_INK, 0.32)}
      backgroundColor={isSolid ? BRAND_NAVY : 'transparent'}
      alignItems="center"
      justifyContent="center"
      hoverStyle={{
        backgroundColor: isSolid
          ? BRAND_NAVY_LIGHT
          : withAlpha(TICKET_INK, 0.05),
        borderColor: isSolid ? BRAND_NAVY_LIGHT : TICKET_INK,
      }}
      focusStyle={{
        borderColor: isSolid ? BRAND_NAVY_LIGHT : TICKET_INK,
        borderWidth: 2,
      }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.3}
        textTransform="uppercase"
        color={isSolid ? WHITE : TICKET_INK}
      >
        {label}
      </Text>
    </XStack>
  );
}

function TicketMatchupLink({ onPress }: { onPress?: () => void }) {
  return (
    <XStack
      testID="home-hero-full-matchup"
      accessibilityRole="link"
      accessibilityLabel="View full matchup"
      onPress={onPress}
      alignSelf="flex-start"
      alignItems="center"
      gap="$1.5"
      marginTop="$2"
      cursor="pointer"
      borderBottomWidth={1}
      borderBottomColor={withAlpha(TICKET_INK, 0.28)}
      paddingBottom={2}
      hoverStyle={{ borderBottomColor: TICKET_INK }}
      focusStyle={{ borderBottomColor: BRAND_NAVY, borderBottomWidth: 2 }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.2}
        textTransform="uppercase"
        color={BRAND_NAVY}
      >
        Full matchup
      </Text>
      <ArrowRight size={12} color={BRAND_NAVY} />
    </XStack>
  );
}

function TicketRankSeal({ rank }: { rank: number }) {
  return (
    <XStack
      borderWidth={1.5}
      borderColor={withAlpha(BRAND_GOLD_DARK, 0.65)}
      backgroundColor={withAlpha(BRAND_GOLD_DARK, 0.1)}
      borderRadius={3}
      paddingVertical={5}
      paddingHorizontal={9}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={10}
        letterSpacing={1.6}
        textTransform="uppercase"
        color={BRAND_GOLD_DARK}
      >
        Rank #{rank}
      </Text>
    </XStack>
  );
}

/** Dashed-rule header: live/deadline pulse, rank seal, close time. */
function TicketHeroHead({ summary }: { summary: HomeLeagueSummary }) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  let label: string;
  if (isDraftLive) {
    label = 'Draft Live';
  } else if (hasMatchup) {
    label =
      summary.currentWeekNumber != null && summary.totalMatchups != null
        ? `Live · Week ${summary.currentWeekNumber}/${summary.totalMatchups}`
        : 'Live';
  } else if (isPreDraft) {
    label = 'Draft Scheduled';
  } else if (summary.leaguePhase === 'active') {
    // No-current-matchup state (LS-9047): between weeks, matches the
    // mockup's plain "Active · Week X/Y" header (no live pulse dot).
    label =
      summary.currentWeekNumber != null && summary.totalMatchups != null
        ? `Active · Week ${summary.currentWeekNumber}/${summary.totalMatchups}`
        : 'Active';
  } else {
    label = 'Offseason';
  }

  const showDot = isDraftLive || hasMatchup;
  const deadline = hasMatchup
    ? formatMatchupCloses(summary.matchupEndTime)
    : null;

  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      gap="$2"
      paddingBottom={13}
      borderBottomWidth={1}
      borderBottomColor={TICKET_RULE}
      borderStyle="dashed"
    >
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <XStack alignItems="center" gap="$2">
          {showDot ? (
            <YStack
              width={7}
              height={7}
              borderRadius={9999}
              backgroundColor={BRAND_SEAM_RED}
            />
          ) : null}
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={11}
            letterSpacing={1.6}
            textTransform="uppercase"
            color={showDot ? BRAND_SEAM_RED : TICKET_INK_SOFT}
          >
            {label}
          </Text>
        </XStack>
        {summary.rank != null ? <TicketRankSeal rank={summary.rank} /> : null}
      </XStack>
      {deadline ? (
        <Text fontFamily={BODY_FONT} fontSize={12.5} color={TICKET_INK_SOFT}>
          Closes {deadline}
        </Text>
      ) : null}
    </XStack>
  );
}

function TicketScoreStat({
  big,
  label,
  color,
}: {
  big: string;
  label: string;
  color: string;
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
        color={TICKET_INK_SOFT}
      >
        {label}
      </Text>
    </YStack>
  );
}

/** One cell of the no-current-matchup standing block (`.tk-stat` in the
 *  mockup) — centered value + label, reusing the same stock/ink tokens as
 *  the live score zone. */
function TicketStandingStat({ big, label }: { big: string; label: string }) {
  return (
    <YStack alignItems="center" paddingHorizontal={8}>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={40}
        $gtXs={{ fontSize: 46 }}
        lineHeight={42}
        letterSpacing={-0.5}
        color={BRAND_NAVY}
        fontVariant={['tabular-nums']}
      >
        {big}
      </Text>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={10.5}
        letterSpacing={1.8}
        textTransform="uppercase"
        color={TICKET_INK_TRAIL}
        marginTop={8}
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * Score zone — the ticket-stock replacement for the old dark-panel
 * `HeroRightPanel`. Score-zone logic (live draft / active matchup /
 * record+rank / offseason) is unchanged from the prior implementation; only
 * the visual treatment moved from dark-panel tokens to on-stock ink tokens.
 */
function TicketHeroScoreZone({
  summary,
  onFullMatchup,
}: {
  summary: HomeLeagueSummary;
  onFullMatchup?: () => void;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  if (isDraftLive) {
    return (
      <YStack gap="$2">
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={26}
          lineHeight={28}
          color={TICKET_INK}
        >
          Draft in Progress
        </Text>
        {summary.draftMode ? (
          <Text fontFamily={BODY_FONT} fontSize={14} color={TICKET_INK_SOFT}>
            {summary.draftMode === 'snake' ? 'Snake draft' : summary.draftMode}
            {summary.selectionMethod === 'auto' ? ' · Auto-pick' : ''}
          </Text>
        ) : null}
      </YStack>
    );
  }

  if (hasMatchup) {
    const userScore = safeScore(summary.userScore);
    const oppScore = safeScore(summary.opponentScore);
    // Ties read as the user leading — mirrors the prior dark-panel logic.
    const isLeading = userScore >= oppScore;
    return (
      <YStack gap="$3">
        <XStack gap="$3.5" alignItems="flex-end">
          <YStack flex={1} minWidth={0} position="relative" paddingBottom={12}>
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.4}
              textTransform="uppercase"
              color={TICKET_INK_SOFT}
              numberOfLines={1}
            >
              My Team
            </Text>
            <Text
              fontFamily={BODY_FONT}
              fontSize={11.5}
              color={TICKET_INK_TRAIL}
              fontVariant={['tabular-nums']}
              marginTop={2}
            >
              {recordOf(summary)}
              {summary.rank != null ? ` · Rank #${summary.rank}` : ''}
            </Text>
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={38}
              $gtXs={{ fontSize: 48 }}
              $gtMd={{ fontSize: 56 }}
              letterSpacing={-0.5}
              fontVariant={['tabular-nums']}
              color={isLeading ? BRAND_NAVY : TICKET_INK_TRAIL}
              marginTop={6}
            >
              {userScore.toFixed(1)}
            </Text>
            {isLeading ? (
              <YStack
                position="absolute"
                bottom={0}
                left={0}
                height={3}
                width={46}
                borderRadius={2}
                backgroundColor={BRAND_GOLD_DARK}
              />
            ) : null}
          </YStack>
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={11}
            letterSpacing={2}
            textTransform="uppercase"
            color={TICKET_INK_TRAIL}
            paddingBottom={16}
          >
            vs
          </Text>
          <YStack
            flex={1}
            minWidth={0}
            position="relative"
            alignItems="flex-end"
            paddingBottom={12}
          >
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.4}
              textTransform="uppercase"
              color={TICKET_INK_SOFT}
              numberOfLines={1}
            >
              {summary.opponentTeamName ?? 'Opponent'}
            </Text>
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={38}
              $gtXs={{ fontSize: 48 }}
              $gtMd={{ fontSize: 56 }}
              letterSpacing={-0.5}
              fontVariant={['tabular-nums']}
              color={!isLeading ? BRAND_NAVY : TICKET_INK_TRAIL}
              marginTop={6}
            >
              {oppScore.toFixed(1)}
            </Text>
            {!isLeading ? (
              <YStack
                position="absolute"
                bottom={0}
                right={0}
                height={3}
                width={46}
                borderRadius={2}
                backgroundColor={BRAND_GOLD_DARK}
              />
            ) : null}
          </YStack>
        </XStack>
        <TicketMatchupLink onPress={onFullMatchup} />
      </YStack>
    );
  }

  if (isPreDraft && summary.draftScheduledAt) {
    return (
      <TicketScoreStat
        big={formatDraftDate(summary.draftScheduledAt)}
        label="Draft Scheduled"
        color={BRAND_GOLD_DARK}
      />
    );
  }

  // No-current-matchup standing block (LS-9047, `.tk-standing` in the
  // mockup): two centered stat cells separated by a dashed rule, in place
  // of the head-to-head score block.
  return (
    <XStack justifyContent="flex-end">
      <TicketStandingStat big={recordOf(summary)} label="Record" />
      {summary.rank != null && summary.totalTeams != null ? (
        <XStack
          borderLeftWidth={1}
          borderLeftColor={TICKET_RULE}
          borderStyle="dashed"
          marginLeft={18}
        >
          <TicketStandingStat
            big={`#${summary.rank}`}
            label={`of ${summary.totalTeams}`}
          />
        </XStack>
      ) : null}
    </XStack>
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
  const eraDesc = formatEraDescriptor(summary);
  const stubLabel =
    summary.currentWeekNumber != null
      ? `Admit One · Week ${summary.currentWeekNumber}`
      : 'Admit One';

  return (
    <XStack
      testID="home-hero-card"
      accessibilityRole="button"
      accessibilityLabel={`Open ${summary.leagueName ?? 'League'}`}
      onPress={onPress}
      cursor="pointer"
      borderRadius={6}
      borderWidth={2}
      borderColor="transparent"
      shadowColor={OVERLAY_BLACK_40}
      shadowOffset={{ width: 0, height: 16 }}
      shadowRadius={38}
      hoverStyle={{
        y: -2,
        shadowColor: OVERLAY_BLACK_50,
        shadowOffset: { width: 0, height: 22 },
        shadowRadius: 44,
      }}
      focusStyle={{
        borderColor: BRAND_GOLD_LIGHT,
        shadowColor: OVERLAY_BLACK_50,
        shadowOffset: { width: 0, height: 22 },
        shadowRadius: 44,
      }}
    >
      <GradientSurface
        flex={1}
        minWidth={0}
        colors={[TICKET_STOCK, TICKET_STOCK_2]}
        angle={155}
        borderRadius={6}
        flexDirection="row"
      >
        <YStack
          flex={1}
          minWidth={0}
          gap="$4"
          paddingVertical={18}
          paddingHorizontal={16}
          $gtXs={{ paddingVertical: 22, paddingHorizontal: 24 }}
          $gtMd={{ paddingTop: 26, paddingHorizontal: 30, paddingBottom: 28 }}
        >
          <TicketHeroHead summary={summary} />
          <YStack
            gap="$5"
            $gtMd={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <YStack flex={1.1} minWidth={0}>
              <Text
                fontFamily={DISPLAY_FONT}
                fontWeight="800"
                fontSize={26}
                $gtXs={{ fontSize: 32 }}
                $gtMd={{ fontSize: 40 }}
                lineHeight={30}
                letterSpacing={-0.5}
                color={TICKET_INK}
              >
                {summary.leagueName ?? 'League'}
              </Text>
              {eraDesc ? (
                <Text
                  fontFamily={BODY_FONT}
                  fontSize={13.5}
                  $gtMd={{ fontSize: 14.5 }}
                  lineHeight={20}
                  color={TICKET_INK_SOFT}
                  marginTop={9}
                  maxWidth={460}
                >
                  {eraDesc}
                </Text>
              ) : null}
              <XStack
                gap="$2"
                flexWrap="wrap"
                alignItems="center"
                marginTop={16}
              >
                {summary.teamCount != null ? (
                  <Text
                    fontFamily={DISPLAY_FONT}
                    fontWeight="700"
                    fontSize={10}
                    $gtMd={{ fontSize: 11 }}
                    letterSpacing={1}
                    textTransform="uppercase"
                    color={TICKET_INK_TRAIL}
                    fontVariant={['tabular-nums']}
                  >
                    {summary.teamCount} teams
                  </Text>
                ) : null}
                {summary.currentWeekNumber != null &&
                summary.totalMatchups != null ? (
                  <Text
                    fontFamily={DISPLAY_FONT}
                    fontWeight="700"
                    fontSize={10}
                    $gtMd={{ fontSize: 11 }}
                    letterSpacing={1}
                    textTransform="uppercase"
                    color={TICKET_INK_TRAIL}
                    fontVariant={['tabular-nums']}
                  >
                    Week {summary.currentWeekNumber} of {summary.totalMatchups}
                  </Text>
                ) : null}
              </XStack>
              <XStack gap="$2" marginTop={20} flexWrap="wrap">
                <TicketButton
                  label="View League"
                  variant="solid"
                  onPress={onPress}
                  testID="home-hero-view-league"
                />
                {onSetLineup ? (
                  <TicketButton
                    label="Set Lineup"
                    variant="outline"
                    onPress={onSetLineup}
                    testID="home-hero-set-lineup"
                  />
                ) : null}
              </XStack>
            </YStack>
            <YStack
              minWidth={0}
              borderTopWidth={1}
              borderTopColor={TICKET_RULE}
              borderStyle="dashed"
              paddingTop={20}
              $gtMd={{
                borderTopWidth: 0,
                borderLeftWidth: 1,
                borderLeftColor: TICKET_RULE,
                paddingTop: 0,
                paddingLeft: 30,
              }}
            >
              <TicketHeroScoreZone summary={summary} onFullMatchup={onPress} />
            </YStack>
          </YStack>
        </YStack>
        <YStack
          testID="home-hero-stub"
          width={34}
          $gtMd={{ width: 56 }}
          position="relative"
          alignItems="center"
          justifyContent="center"
          borderLeftWidth={2}
          borderLeftColor={TICKET_RULE}
          borderStyle="dashed"
          backgroundColor={withAlpha(TICKET_INK, 0.03)}
        >
          <YStack
            position="absolute"
            left={-7}
            top={-7}
            width={14}
            height={14}
            borderRadius={9999}
            backgroundColor="$background"
          />
          <YStack
            position="absolute"
            left={-7}
            bottom={-7}
            width={14}
            height={14}
            borderRadius={9999}
            backgroundColor="$background"
          />
          <Text
            rotate="-90deg"
            numberOfLines={1}
            fontFamily={DISPLAY_FONT}
            fontWeight="800"
            fontSize={9}
            $gtMd={{ fontSize: 10 }}
            letterSpacing={2.2}
            textTransform="uppercase"
            color={BRAND_SEAM_RED}
          >
            {stubLabel}
          </Text>
        </YStack>
      </GradientSurface>
    </XStack>
  );
}

/* ─── Football playboard hero (LS-9035) ───
   Football's answer to the baseball hero above: a chalk-textured "playboard"
   carrying league identity, with a beveled-chrome broadcast "bug" mounted on
   it carrying live score/standing. Design source: home.html .playboard,
   .pb-, and .bug selectors (~lines 1095-1259) and the pb-hero markup
   (~lines 1502-1532).
   The bug's chrome/badge/plate/bottom-bar gradients are load-bearing for the
   "mounted hardware" effect, so they render via `GradientSurface` for real
   cross-platform gradients (native SVG) rather than a flat card. The board's
   diagonal-hatch + radial-highlight texture is decorative, not load-bearing,
   and is web-only CSS (`style.backgroundImage`, same pattern as `Card.tsx`'s
   premium gradient) — native falls back to the flat board top color. */

/** First-initials abbreviation for the bug's team-plate label, e.g. "Steel
 *  Curtain" → "SC". The data model has no team-abbreviation field, so this is
 *  derived from the same name the rest of the UI already shows. */
function teamAbbr(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
  return (initials || name).slice(0, 3);
}

function PlayboardButton({
  label,
  onPress,
  variant,
  testID,
  fullWidth = false,
}: {
  label: string;
  onPress?: () => void;
  variant: 'solid' | 'outline';
  testID?: string;
  /** `@container pboard (max-width: 380px)` — actions go full-width (LS-9047). */
  fullWidth?: boolean;
}) {
  const isSolid = variant === 'solid';
  return (
    <XStack
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(e: GestureResponderEvent) => {
        e.stopPropagation?.();
        onPress?.();
      }}
      tabIndex={0}
      minHeight={44}
      width={fullWidth ? '100%' : undefined}
      paddingVertical={12}
      paddingHorizontal={18}
      borderRadius={4}
      borderWidth={1}
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      backgroundColor={isSolid ? playboardTokens.bug.badgeTop : 'transparent'}
      borderColor={
        isSolid
          ? playboardTokens.buttonBorder
          : withAlpha(playboardTokens.textPrimary, 0.35)
      }
      hoverStyle={{
        backgroundColor: isSolid
          ? playboardTokens.buttonHover
          : withAlpha(WHITE, 0.07),
        borderColor: isSolid
          ? playboardTokens.buttonBorder
          : playboardTokens.textPrimary,
      }}
      focusStyle={{
        borderColor: playboardTokens.liveMint,
        borderWidth: 2,
      }}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.1}
        textTransform="uppercase"
        color={
          isSolid ? playboardTokens.buttonText : playboardTokens.textPrimary
        }
      >
        {label}
      </Text>
    </XStack>
  );
}

/** The bug's "Legacy" wordmark badge bar. */
function BugBadge() {
  return (
    <GradientSurface
      colors={[playboardTokens.bug.badgeTop, playboardTokens.bug.badgeBottom]}
      angle={180}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      gap="$2"
      paddingVertical={6}
      paddingHorizontal={8}
    >
      <YStack
        width={13}
        height={13}
        borderRadius={9999}
        backgroundColor={WHITE}
      />
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={12}
        letterSpacing={2.2}
        color={playboardTokens.bug.badgeEyeText}
      >
        Legacy
      </Text>
    </GradientSurface>
  );
}

/** One stacked team plate — the leading plate is highlighted gold with a
 *  possession arrow, matching the mockup's `.bug-row.lead`. */
function BugPlate({
  abbr,
  sub,
  points,
  leading,
  standing = false,
}: {
  abbr: string;
  sub?: string | null;
  points: string;
  leading: boolean;
  /** Shrinks abbr/points type, matching the mockup's `.bug-row.bug-standing`
   *  no-current-matchup row (LS-9047). */
  standing?: boolean;
}) {
  return (
    <GradientSurface
      colors={[playboardTokens.bug.plateTop, playboardTokens.bug.plateBottom]}
      angle={180}
      flexDirection="row"
      alignItems="center"
      gap="$2"
      paddingVertical={8}
      paddingHorizontal={10}
    >
      <YStack width={14} alignItems="center">
        {leading ? (
          <YStack
            width={0}
            height={0}
            borderLeftWidth={7}
            borderTopWidth={5}
            borderBottomWidth={5}
            borderLeftColor={playboardTokens.bug.possessionGold}
            borderTopColor="transparent"
            borderBottomColor="transparent"
          />
        ) : null}
      </YStack>
      <YStack flex={1} minWidth={0}>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={standing ? 13 : 24}
          letterSpacing={standing ? 1.6 : 1.3}
          color={playboardTokens.bug.textOnChrome}
          numberOfLines={1}
        >
          {abbr}
        </Text>
        {sub ? (
          <Text
            fontFamily={DISPLAY_FONT}
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.6}
            color={withAlpha(playboardTokens.bug.textOnChrome, 0.72)}
            fontVariant={['tabular-nums']}
          >
            {sub}
          </Text>
        ) : null}
      </YStack>
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={standing ? 22 : 26}
        minWidth={56}
        textAlign="right"
        color={
          leading
            ? playboardTokens.bug.leadGold
            : playboardTokens.bug.textOnChrome
        }
        fontVariant={['tabular-nums']}
      >
        {points}
      </Text>
    </GradientSurface>
  );
}

/** A single non-score status plate — draft-live / pre-draft / offseason. */
function BugStatusPlate({ label }: { label: string }) {
  return (
    <GradientSurface
      colors={[playboardTokens.bug.plateTop, playboardTokens.bug.plateBottom]}
      angle={180}
      alignItems="center"
      justifyContent="center"
      paddingVertical={16}
      paddingHorizontal={10}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={15}
        letterSpacing={0.6}
        color={playboardTokens.bug.textOnChrome}
        textAlign="center"
      >
        {label}
      </Text>
    </GradientSurface>
  );
}

function BugBottomBar({
  left,
  right,
}: {
  left: string;
  right?: string | null;
}) {
  return (
    <GradientSurface
      colors={[playboardTokens.bug.bottomLight, playboardTokens.bug.bottomDark]}
      angle={180}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      paddingVertical={7}
      paddingHorizontal={10}
    >
      <Text
        fontFamily={DISPLAY_FONT}
        fontWeight="800"
        fontSize={11.5}
        letterSpacing={1.6}
        textTransform="uppercase"
        color={playboardTokens.bug.textOnBottomBar}
        fontVariant={['tabular-nums']}
      >
        {left}
      </Text>
      {right ? (
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="800"
          fontSize={11.5}
          letterSpacing={1.6}
          textTransform="uppercase"
          color={playboardTokens.bug.textOnBottomBar}
          fontVariant={['tabular-nums']}
        >
          {right}
        </Text>
      ) : null}
    </GradientSurface>
  );
}

/** The beveled-chrome scorebug — fixed 250px, mounted on the board. */
function PlayboardBug({
  summary,
  fullWidth = false,
}: {
  summary: HomeLeagueSummary;
  /** Forces the bug to 100% width even at wide viewports — set when the
   *  board's own rendered width has dropped below the `@container pboard`
   *  560px breakpoint (LS-9047). */
  fullWidth?: boolean;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';
  const isBye = summary.leaguePhase === 'active' && !hasMatchup;

  let body: React.ReactNode;
  let bottomLeft: string;
  let bottomRight: string | null = null;

  if (isDraftLive) {
    body = (
      <BugStatusPlate
        label={summary.draftMode === 'snake' ? 'Snake Draft' : 'Draft Live'}
      />
    );
    bottomLeft = 'Draft in progress';
  } else if (hasMatchup) {
    const userScore = safeScore(summary.userScore);
    const oppScore = safeScore(summary.opponentScore);
    const isLeading = userScore >= oppScore;
    body = (
      <>
        <BugPlate
          abbr="You"
          sub={recordOf(summary)}
          points={userScore.toFixed(1)}
          leading={isLeading}
        />
        <BugPlate
          abbr={teamAbbr(summary.opponentTeamName ?? 'Opponent')}
          points={oppScore.toFixed(1)}
          leading={!isLeading}
        />
      </>
    );
    bottomLeft =
      summary.currentWeekNumber != null && summary.totalMatchups != null
        ? `Week ${summary.currentWeekNumber} of ${summary.totalMatchups}`
        : 'This week';
    bottomRight = formatMatchupCloses(summary.matchupEndTime)
      ? `Closes ${formatMatchupCloses(summary.matchupEndTime)}`
      : null;
  } else if (isPreDraft && summary.draftScheduledAt) {
    body = <BugStatusPlate label={formatDraftDate(summary.draftScheduledAt)} />;
    bottomLeft = 'Draft scheduled';
    bottomRight =
      summary.teamCount != null ? `${summary.teamCount} teams` : null;
  } else if (isBye) {
    // No-current-matchup ("bye week") standing row (LS-9047): the bug keeps
    // its two plates, but the second becomes a `.bug-row.bug-standing` rank
    // row instead of an opponent score.
    body = (
      <>
        <BugPlate abbr="You" points={recordOf(summary)} leading={false} />
        <BugPlate
          abbr="Standing"
          points={summary.rank != null ? `#${summary.rank}` : '—'}
          leading={false}
          standing
        />
      </>
    );
    bottomLeft =
      summary.currentWeekNumber != null && summary.totalMatchups != null
        ? `Week ${summary.currentWeekNumber} of ${summary.totalMatchups}`
        : 'This week';
    bottomRight = 'Bye';
  } else {
    body = <BugStatusPlate label={recordOf(summary)} />;
    bottomLeft =
      summary.rank != null && summary.totalTeams != null
        ? `Rank #${summary.rank} of ${summary.totalTeams}`
        : 'Season record';
  }

  return (
    <YStack
      width="100%"
      $gtSm={{ width: fullWidth ? '100%' : 250 }}
      alignSelf="stretch"
    >
      <GradientSurface
        testID="home-playboard-bug"
        colors={[
          playboardTokens.bug.chromeLight,
          playboardTokens.bug.chromeDark,
        ]}
        angle={180}
        width="100%"
        height="100%"
        borderRadius={4}
        padding={4}
      >
        <YStack
          flex={1}
          borderRadius={2}
          overflow="hidden"
          borderWidth={1}
          borderColor={playboardTokens.bug.innerBorder}
        >
          <BugBadge />
          {body}
          <BugBottomBar left={bottomLeft} right={bottomRight} />
        </YStack>
      </GradientSurface>
    </YStack>
  );
}

/** Football's hero card: the chalk-textured playboard + mounted bug. */
function PlayboardHeroCard({
  summary,
  onPress,
  onSetLineup,
}: {
  summary: HomeLeagueSummary;
  onPress: () => void;
  onSetLineup?: () => void;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';
  const isActive = summary.leaguePhase === 'active';
  const eraDesc = formatEraDescriptor(summary);

  // `@container pboard` breakpoints (LS-9047): the mockup keys these off the
  // board's own rendered width, not the viewport, so — unlike the rest of
  // this file's `$gtXs`/`$gtSm` viewport breakpoints — they're measured via
  // `onLayout`. React Native has no CSS container-query equivalent; this is
  // the platform-agnostic substitute (works identically on web and native).
  const [boardWidth, setBoardWidth] = useState<number | null>(null);
  const stackBug = boardWidth != null && boardWidth <= 560;
  const compactActions = boardWidth != null && boardWidth <= 380;

  // No-current-matchup ("bye week") state (LS-9047): active league, no live
  // matchup. Header drops the live pulse dot and switches to the muted
  // secondary color, matching the mockup's plain "Bye week · Week X/Y" text.
  const isBye = isActive && !hasMatchup;

  let headerLabel: string;
  if (isDraftLive) {
    headerLabel = 'Draft Live';
  } else if (hasMatchup && summary.currentWeekNumber != null) {
    headerLabel = `Live · Week ${summary.currentWeekNumber}${summary.totalMatchups != null ? `/${summary.totalMatchups}` : ''}`;
  } else if (hasMatchup) {
    headerLabel = 'Live';
  } else if (isPreDraft) {
    headerLabel = 'Draft Scheduled';
  } else if (isBye) {
    headerLabel =
      summary.currentWeekNumber != null && summary.totalMatchups != null
        ? `Bye week · Week ${summary.currentWeekNumber}/${summary.totalMatchups}`
        : 'Bye week';
  } else {
    headerLabel = 'Offseason';
  }
  const headerColor = isBye
    ? playboardTokens.textSecondary
    : playboardTokens.liveMint;

  const whenLabel = hasMatchup
    ? formatMatchupCloses(summary.matchupEndTime)
    : isPreDraft && summary.draftScheduledAt
      ? formatDraftDate(summary.draftScheduledAt)
      : null;

  return (
    <YStack
      testID="home-playboard-hero"
      accessibilityRole="button"
      accessibilityLabel={`Open ${summary.leagueName ?? 'League'}`}
      onPress={onPress}
      onLayout={(e: LayoutChangeEvent) =>
        setBoardWidth(e.nativeEvent.layout.width)
      }
      tabIndex={0}
      cursor="pointer"
      position="relative"
      overflow="hidden"
      borderRadius={8}
      borderWidth={1}
      borderColor={playboardTokens.border}
      backgroundColor={playboardTokens.bgTop}
      padding={26}
      $gtSm={{ padding: 28 }}
      style={{
        backgroundImage: playboardTokens.boardBackgroundImage,
        boxShadow: playboardTokens.boardShadow,
        transition: 'transform 220ms ease, box-shadow 220ms ease',
      }}
      hoverStyle={{
        borderColor: withAlpha(playboardTokens.textPrimary, 0.3),
        y: -2,
      }}
      focusStyle={{
        borderColor: playboardTokens.liveMint,
        borderWidth: 2,
      }}
    >
      {/* Dashed chalk-board inset border — decorative, matches .playboard::before. */}
      <YStack
        position="absolute"
        top={11}
        left={11}
        right={11}
        bottom={11}
        borderWidth={1}
        borderStyle="dashed"
        borderColor={withAlpha(playboardTokens.textPrimary, 0.16)}
        borderRadius={4}
        pointerEvents="none"
      />

      <YStack gap="$4">
        <XStack
          alignItems="center"
          gap="$3"
          flexWrap="wrap"
          paddingBottom={12}
          borderBottomWidth={1}
          borderBottomColor={withAlpha(playboardTokens.textPrimary, 0.2)}
          borderStyle="dashed"
        >
          <XStack alignItems="center" gap="$2">
            {isBye ? null : (
              <YStack
                width={8}
                height={8}
                borderRadius={9999}
                backgroundColor={playboardTokens.liveMint}
              />
            )}
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="800"
              fontSize={11}
              letterSpacing={1.6}
              textTransform="uppercase"
              color={headerColor}
            >
              {headerLabel}
            </Text>
          </XStack>
          {summary.rank != null ? (
            <XStack
              borderWidth={1}
              borderColor={withAlpha(playboardTokens.textPrimary, 0.4)}
              backgroundColor={withAlpha(playboardTokens.textPrimary, 0.08)}
              borderRadius={9999}
              paddingVertical={3}
              paddingHorizontal={9}
            >
              <Text
                fontFamily={DISPLAY_FONT}
                fontWeight="700"
                fontSize={11}
                color={playboardTokens.textPrimary}
              >
                {`Rank #${summary.rank}`}
              </Text>
            </XStack>
          ) : null}
          {whenLabel ? (
            <Text
              marginLeft="auto"
              fontFamily={BODY_FONT}
              fontSize={12}
              color={playboardTokens.textSecondary}
            >
              {hasMatchup ? `Closes ${whenLabel}` : `Drafts ${whenLabel}`}
            </Text>
          ) : null}
        </XStack>

        <YStack
          gap="$5"
          $gtSm={{
            flexDirection: stackBug ? 'column' : 'row',
            alignItems: 'stretch',
          }}
        >
          <YStack flex={1} minWidth={0} justifyContent="space-between" gap="$4">
            <YStack gap="$2">
              <Text
                fontFamily={DISPLAY_FONT}
                fontWeight="800"
                fontSize={compactActions ? 24 : 26}
                $gtSm={{ fontSize: compactActions ? 24 : 34 }}
                lineHeight={32}
                textTransform="uppercase"
                color={playboardTokens.textPrimary}
              >
                {summary.leagueName ?? 'League'}
              </Text>
              {eraDesc ? (
                <Text
                  fontFamily={BODY_FONT}
                  fontStyle="italic"
                  fontSize={13.5}
                  lineHeight={19}
                  color={playboardTokens.textSecondary}
                >
                  {eraDesc}
                </Text>
              ) : null}
              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                {summary.teamCount != null ? (
                  <Text
                    fontFamily={DISPLAY_FONT}
                    fontWeight="700"
                    fontSize={10.5}
                    letterSpacing={1.2}
                    textTransform="uppercase"
                    color={playboardTokens.textMeta}
                    fontVariant={['tabular-nums']}
                  >
                    {`${summary.teamCount} teams`}
                  </Text>
                ) : null}
              </XStack>
            </YStack>
            <XStack
              gap="$2"
              flexDirection={compactActions ? 'column' : 'row'}
              flexWrap="wrap"
            >
              <PlayboardButton
                label="Set Lineup"
                variant="solid"
                onPress={onSetLineup}
                testID="home-playboard-set-lineup"
                fullWidth={compactActions}
              />
              <PlayboardButton
                label="View League"
                variant="outline"
                onPress={onPress}
                testID="home-playboard-view-league"
                fullWidth={compactActions}
              />
            </XStack>
          </YStack>

          <PlayboardBug summary={summary} fullWidth={stackBug} />
        </YStack>
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
  let scoreColor = '$color';

  if (isDraftLive) {
    scoreBig = 'Live';
    scoreLabel = summary.draftMode ?? 'Draft';
    scoreColor = BRAND_SEAM_RED_LIGHT;
  } else if (hasMatchup) {
    const userScore = safeScore(summary.userScore);
    const oppScore = safeScore(summary.opponentScore);
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
      backgroundColor="$surfaceCard"
      paddingVertical={18}
      paddingHorizontal={22}
      gap="$3"
      alignItems="center"
      hoverStyle={{ backgroundColor: '$color4' }}
    >
      <YStack flex={1} gap="$1" minWidth={0}>
        <Text
          fontFamily={DISPLAY_FONT}
          fontWeight="700"
          fontSize={18}
          color="$color"
          numberOfLines={1}
        >
          {summary.leagueName ?? 'League'}
        </Text>
        {subParts.length > 0 ? (
          <Text
            fontFamily={BODY_FONT}
            fontSize={13}
            color="$textMuted"
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
            borderColor="$outlineStrong"
            borderRadius={9999}
            paddingVertical={8}
            paddingHorizontal={12}
            cursor="pointer"
            hoverStyle={{ borderColor: '$borderColorFocus' }}
          >
            <Text
              fontFamily={DISPLAY_FONT}
              fontWeight="700"
              fontSize={11}
              letterSpacing={1.1}
              textTransform="uppercase"
              color="$textMuted"
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
          color="$textMuted"
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
  showBadge,
  onView,
  onCreate,
}: {
  sport: SportConfig;
  isLight?: boolean;
  full?: boolean;
  showBadge?: boolean;
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
      borderColor="$glassBorder"
      borderRadius={20}
      padding={full ? 32 : 28}
      gap="$4"
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
        <YStack
          width={full ? 72 : 64}
          height={full ? 72 : 64}
          borderRadius={12}
          backgroundColor="$glassSurfaceLight"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          alignItems="center"
          justifyContent="center"
          opacity={sport.available ? 1 : 0.6}
        >
          <BrandIcon
            name={sport.icon}
            size={full ? 40 : 36}
            decorative={false}
            title={sport.title}
          />
        </YStack>
        {full || showBadge ? (
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
          color="$color"
        >
          {sport.title}
        </Text>
        <Text
          fontFamily={BODY_FONT}
          fontSize={full ? 15 : 14}
          color="$textMuted"
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
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
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
          color="$color"
        >
          {isNewUser
            ? 'Or just browse a century of data'
            : 'Explore player statistics'}
        </Text>
        <Text fontFamily={BODY_FONT} fontSize={14} color="$textMuted">
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

function MockDraftCta({
  onPress,
  atCap = false,
}: {
  onPress: () => void;
  atCap?: boolean;
}) {
  return (
    <XStack
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
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
          color="$color"
        >
          See who falls to your pick.
        </Text>
        <Text fontFamily={BODY_FONT} fontSize={14} color="$textMuted">
          {atCap
            ? "You've used your free mock drafts this week. Upgrade or check back next week."
            : 'Run a 12-team snake against bots in under ten minutes. Once you join a real league, mocks pull from that league’s exact era and ruleset.'}
        </Text>
      </YStack>
      <ActionButton
        label="Start Mock Draft"
        variant="navy"
        onPress={onPress}
        disabled={atCap}
      />
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
      borderBottomColor="$surfacePanelBorder"
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
        color="$color"
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
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
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
          color="$color"
        >
          Exclusive league types unlocked
        </Text>
      </XStack>
      <Text fontFamily={BODY_FONT} fontSize={14} color="$textMuted">
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
    topInset = 0,
    loading = false,
    error = false,
    showArchived = false,
    archivedLoading = false,
    onShowArchived,
    onHideArchived,
    onRetry,
    onViewLeague,
    onSetLineup,
    onMockDraft,
    onCreateLeague,
    onJoinLeague,
    onBrowseStats,
    onViewSport,
    onStartMockDraft,
    mockDraftAtCap,
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

  const derivedStats = useMemo<HomeUserStats>(
    () => userStats ?? deriveHomeUserStats(sortedSummaries),
    [userStats, sortedSummaries],
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <ScrollView
        testID="home-screen"
        backgroundColor="$background"
        paddingTop={topInset}
      >
        <YStack
          flex={1}
          minHeight={400}
          alignItems="center"
          justifyContent="center"
          padding="$8"
          gap="$4"
        >
          <Spinner size="large" color={BRAND_GOLD_LIGHT} />
          <Text fontFamily={BODY_FONT} color="$textMuted">
            Loading your dashboard…
          </Text>
        </YStack>
      </ScrollView>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <ScrollView
        testID="home-screen"
        backgroundColor="$background"
        paddingTop={topInset}
      >
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
            backgroundColor="$surfacePanel"
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
              color="$color"
            >
              Unable to load your leagues
            </H2>
            <Text fontFamily={BODY_FONT} fontSize={15} color="$textMuted">
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
      <ScrollView
        testID="home-screen"
        backgroundColor="$background"
        paddingTop={topInset}
      >
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
                color="$textMuted"
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
                  color="$textMuted"
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
                  color="$textMuted"
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
                {heroLeague.sport === 'football' ? (
                  <PlayboardHeroCard
                    summary={heroLeague}
                    onPress={() => onViewLeague(heroLeague)}
                    onSetLineup={
                      onSetLineup ? () => onSetLineup(heroLeague) : undefined
                    }
                  />
                ) : (
                  <LeagueHeroCard
                    summary={heroLeague}
                    onPress={() => onViewLeague(heroLeague)}
                    onSetLineup={
                      onSetLineup ? () => onSetLineup(heroLeague) : undefined
                    }
                  />
                )}
                {secondaryLeagues.length > 0 ? (
                  <YStack
                    borderWidth={1}
                    borderColor="$surfacePanelBorder"
                    borderRadius={12}
                    overflow="hidden"
                    gap={1}
                    backgroundColor="$surfacePanelBorder"
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
                      borderColor="$surfacePanelBorder"
                      borderStyle="dashed"
                      borderRadius={9999}
                      paddingVertical={10}
                      paddingHorizontal={16}
                      cursor="pointer"
                      hoverStyle={{ borderColor: '$outlineStrong' }}
                    >
                      <Text
                        fontFamily={DISPLAY_FONT}
                        fontWeight="700"
                        fontSize={12}
                        letterSpacing={1.1}
                        textTransform="uppercase"
                        color="$textMuted"
                      >
                        {archivedCount != null
                          ? `Show ${archivedCount} archived ${archivedCount === 1 ? 'league' : 'leagues'}`
                          : 'Show archived leagues'}
                      </Text>
                    </XStack>
                  ) : null
                ) : (
                  <YStack gap="$3">
                    <XStack
                      testID="home-hide-archived"
                      accessibilityRole="button"
                      accessibilityLabel="Hide archived leagues"
                      onPress={onHideArchived}
                      alignItems="center"
                      gap="$2"
                      cursor={onHideArchived ? 'pointer' : undefined}
                      tabIndex={onHideArchived ? 0 : undefined}
                      onKeyDown={
                        onHideArchived
                          ? (e: React.KeyboardEvent<HTMLElement>) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onHideArchived();
                              }
                            }
                          : undefined
                      }
                    >
                      <Text
                        fontFamily={DISPLAY_FONT}
                        fontWeight="700"
                        fontSize={14}
                        letterSpacing={1.1}
                        textTransform="uppercase"
                        color="$textMuted"
                      >
                        {`${onHideArchived ? '▾ ' : ''}Archived`}
                      </Text>
                    </XStack>
                    {archivedLoading ? (
                      <XStack gap="$2" alignItems="center">
                        <Spinner size="small" color={BRAND_GOLD_LIGHT} />
                        <Text
                          fontFamily={BODY_FONT}
                          fontSize={13}
                          color="$textMuted"
                        >
                          Loading archived leagues…
                        </Text>
                      </XStack>
                    ) : archivedLeagues.length > 0 ? (
                      <YStack
                        borderWidth={1}
                        borderColor="$surfacePanelBorder"
                        borderRadius={12}
                        overflow="hidden"
                        gap={1}
                        backgroundColor="$surfacePanelBorder"
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
                    ) : (
                      <Text
                        testID="home-archived-empty"
                        fontFamily={BODY_FONT}
                        fontSize={13}
                        color="$textMuted"
                      >
                        No archived leagues.
                      </Text>
                    )}
                  </YStack>
                )}
              </YStack>

              <YStack gap="$5">
                <SectionHead eyebrow="Your Sports" title="Pick your sport" />
                <YStack gap="$4" $gtSm={{ flexDirection: 'row' }}>
                  {SPORTS.map((sport) => (
                    <SportCard
                      key={sport.key}
                      sport={sport}
                      isLight={isLight}
                      showBadge
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
    <ScrollView
      testID="home-screen"
      backgroundColor="$background"
      paddingTop={topInset}
    >
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
          borderBottomColor="$surfacePanelBorder"
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
            color="$color"
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
            color="$textMuted"
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
            <MockDraftCta onPress={onStartMockDraft} atCap={mockDraftAtCap} />
          </YStack>
        ) : null}

        <StatsCta onPress={onBrowseStats} isNewUser />
      </YStack>
    </ScrollView>
  );
}

export default HomeScreen;
