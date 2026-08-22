import React, { useMemo } from 'react';
import { ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import type { RefreshControlProps } from 'react-native';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { formatDraftDate } from '@legacy-sports/utils';
import {
  formatDraftDayShort,
  formatEraName,
} from '../home/homeSummaryFormatters';
import {
  aggregateActiveRecord,
  type HomeLeagueSummary,
  isLiveMatchup,
  isPreDraft,
  recordLabel,
  safeScore,
  urgencyKey,
} from '../home/leagueSummaryStats';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED_LIGHT,
  OUTLINE_STRONG,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';

/**
 * The "Clubhouse Ledger" Leagues screen (LS-8795) — a dense, vintage box-score
 * table of every league the user manages: record, rank, live matchup line,
 * commissioner badge, and an aggregate season footer.
 *
 * Purely presentational and cross-platform: each app supplies the league
 * summaries and the navigation callbacks. Currently consumed by the mobile
 * Leagues tab (`apps/app/src/app/(app)/(tabs)/leagues.tsx`).
 */

/* ─── Ledger metrics (from the design handoff) ─── */

const INDEX_COL_WIDTH = 24;
const RECORD_COL_WIDTH = 52;
const RANK_COL_WIDTH = 36;
const COL_GAP = 10;
/** Live rows trade 2px of left padding for the seam-red accent border. */
const ROW_PAD_LEFT = 10;
const LIVE_ROW_PAD_LEFT = 8;
const LIVE_ACCENT_WIDTH = 2;
/** Ledger rules: hairlines between rows, gold above the aggregate footer. */
const HAIRLINE = withAlpha(WHITE, 0.08);
const GOLD_RULE = withAlpha(BRAND_GOLD, 0.4);
const MASTHEAD_RULE = withAlpha(BRAND_GOLD, 0.5);
const INDEX_NUMERAL = withAlpha(BRAND_GOLD, 0.6);
const COMM_CHIP_BG = withAlpha(BRAND_GOLD, 0.16);
const COMM_CHIP_BORDER = withAlpha(BRAND_GOLD, 0.4);
/** Minimum tap target for a ledger row. */
const ROW_MIN_HEIGHT = 44;

export interface LeaguesLedgerScreenProps {
  /** The user's active leagues. The component orders them internally. */
  leagues?: HomeLeagueSummary[];
  loading?: boolean;
  /** Top safe-area inset, applied as padding so content clears the status bar. */
  topInset?: number;
  onViewLeague: (summary: HomeLeagueSummary) => void;
  onCreateLeague: () => void;
  /** Navigates straight to the join-league page (LS-8986) — mirrors the
   * Home tab's "Join League" quick action rather than opening a picker. */
  onJoinLeague: () => void;
  /** Empty-state CTA — goes straight to league discovery. */
  onBrowseLeagues: () => void;
  /** Pull-to-refresh control for the ledger's `ScrollView` (LS-8847). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

/* ─── Ordering ─── */

/**
 * Ledger order: live matchups first, then by urgency (live draft, active,
 * pre-draft, everything else), then by rank within a tier. `Array.sort` is
 * stable, so leagues that tie on all three keep their incoming order.
 *
 * Standings now arrive after the summaries (LS-9528), so `rank` is null on the
 * first render and rows re-order once within their urgency tier when it lands.
 * That re-order is **accepted**, not deferred: the tier boundaries (live, draft,
 * active, pre-draft) never move, both stat columns are fixed-width
 * (`RECORD_COL_WIDTH`, `RANK_COL_WIDTH`) and rows are a fixed `ROW_MIN_HEIGHT`,
 * so nothing reflows — and holding the tiebreak back would only postpone the
 * same single re-order while permanently degrading the order for the rest of the
 * session. Nulls sort last, so unranked leagues sit below ranked ones instead of
 * jumping to the top.
 */
function sortLedgerRows(summaries: HomeLeagueSummary[]): HomeLeagueSummary[] {
  return [...summaries].sort((a, b) => {
    const live = Number(isLiveMatchup(b)) - Number(isLiveMatchup(a));
    if (live !== 0) return live;
    const urgency = urgencyKey(a) - urgencyKey(b);
    if (urgency !== 0) return urgency;
    return (
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

/* ─── Row sub-line ─── */

interface SubLine {
  text: string;
  color: string;
}

function subLineOf(summary: HomeLeagueSummary): SubLine {
  if (isLiveMatchup(summary)) {
    const opponent = summary.opponentTeamName ?? 'your opponent';
    return {
      text: `Live — ${safeScore(summary.userScore).toFixed(1)} to ${safeScore(
        summary.opponentScore,
      ).toFixed(1)} over ${opponent}`,
      color: BRAND_SEAM_RED_LIGHT,
    };
  }

  if (isPreDraft(summary) && summary.draftScheduledAt) {
    const when = formatDraftDate(summary.draftScheduledAt);
    if (when) return { text: `Drafts ${when}`, color: BRAND_GOLD_LIGHT };
  }

  const parts: string[] = [];
  const era = formatEraName(summary);
  if (era) parts.push(era);
  if (summary.teamCount != null) parts.push(`${summary.teamCount} teams`);
  if (isPreDraft(summary)) parts.push('pre-draft');
  return {
    text: parts.length > 0 ? parts.join(' · ') : 'Season in progress',
    color: TEXT_MUTED,
  };
}

/* ─── Masthead ─── */

function LedgerMasthead({
  leagueCount,
  aggregateRecord,
}: {
  leagueCount: number;
  aggregateRecord: string | null;
}) {
  const meta = [
    `${leagueCount} ${leagueCount === 1 ? 'league' : 'leagues'}`,
    aggregateRecord,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <YStack testID="leagues-masthead">
      <XStack alignItems="flex-end" justifyContent="space-between" gap="$3">
        <YStack gap={2} flexShrink={1}>
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize={11}
            letterSpacing={2.5}
            color={BRAND_GOLD_LIGHT}
          >
            THE CLUBHOUSE
          </Text>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={34}
            lineHeight={34}
            color={TEXT_PRIMARY}
          >
            LEAGUES
          </Text>
        </YStack>
        <Text
          testID="leagues-masthead-meta"
          fontFamily="$body"
          fontStyle="italic"
          fontSize={12}
          color={TEXT_MUTED}
          paddingBottom={2}
        >
          {meta}
        </Text>
      </XStack>
      {/* 3px "double" rule — React Native has no borderStyle: double, so the
          two hairlines are drawn explicitly. */}
      <YStack
        height={3}
        marginTop={12}
        borderTopWidth={1}
        borderBottomWidth={1}
        borderColor={MASTHEAD_RULE}
      />
    </YStack>
  );
}

/* ─── Column header ─── */

function LedgerColumnHeader() {
  const headingProps = {
    fontFamily: '$heading' as const,
    fontWeight: '700' as const,
    fontSize: 11,
    letterSpacing: 1.8,
    color: TEXT_TERTIARY,
  };

  return (
    <XStack
      gap={COL_GAP}
      paddingVertical={6}
      paddingHorizontal={4}
      alignItems="center"
    >
      <YStack width={INDEX_COL_WIDTH} />
      <Text flex={1} {...headingProps}>
        LEAGUE
      </Text>
      <Text width={RECORD_COL_WIDTH} textAlign="right" {...headingProps}>
        W-L
      </Text>
      <Text width={RANK_COL_WIDTH} textAlign="right" {...headingProps}>
        RK
      </Text>
    </XStack>
  );
}

/* ─── Row ─── */

function LedgerRow({
  summary,
  index,
  onPress,
}: {
  summary: HomeLeagueSummary;
  index: number;
  onPress: () => void;
}) {
  const live = isLiveMatchup(summary);
  const leadingLive = live
    ? safeScore(summary.userScore) >= safeScore(summary.opponentScore)
    : false;
  // Day only — the full date with its time goes in the sub-line, which has the
  // room for it; the W-L column does not.
  const draftDate =
    isPreDraft(summary) && summary.draftScheduledAt
      ? formatDraftDayShort(summary.draftScheduledAt)
      : '';
  const subLine = subLineOf(summary);
  const name = summary.leagueName ?? 'Unnamed League';
  const ranked = summary.rank != null && summary.totalTeams != null;

  return (
    <XStack
      testID={`league-row-${summary.leagueId}`}
      gap={COL_GAP}
      alignItems="center"
      minHeight={ROW_MIN_HEIGHT}
      paddingVertical={14}
      paddingRight={4}
      paddingLeft={live ? LIVE_ROW_PAD_LEFT : ROW_PAD_LEFT}
      borderTopWidth={1}
      borderTopColor={HAIRLINE}
      borderLeftWidth={live ? LIVE_ACCENT_WIDTH : 0}
      borderLeftColor={live ? BRAND_SEAM_RED_LIGHT : 'transparent'}
      cursor="pointer"
      pressStyle={{ opacity: 0.7, scale: 0.99 }}
      onPress={onPress}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open league ${name}`}
    >
      <Text
        width={INDEX_COL_WIDTH}
        fontFamily="$heading"
        fontWeight="800"
        fontSize={18}
        color={INDEX_NUMERAL}
      >
        {index + 1}
      </Text>

      <YStack flex={1} minWidth={0} gap={1}>
        <XStack alignItems="center" gap={6}>
          <Text
            flexShrink={1}
            fontFamily="$heading"
            fontWeight="800"
            fontSize={18}
            color={TEXT_PRIMARY}
            textTransform="uppercase"
            numberOfLines={1}
          >
            {name}
          </Text>
          {summary.isCommissioner ? (
            <Text
              testID={`league-row-${summary.leagueId}-comm`}
              backgroundColor={COMM_CHIP_BG}
              borderWidth={1}
              borderColor={COMM_CHIP_BORDER}
              borderRadius={2}
              paddingVertical={1}
              paddingHorizontal={5}
              fontFamily="$heading"
              fontWeight="700"
              fontSize={10}
              letterSpacing={1}
              color={BRAND_GOLD_LIGHT}
            >
              COMM
            </Text>
          ) : null}
        </XStack>
        <Text
          fontFamily="$body"
          fontStyle="italic"
          fontSize={11}
          color={subLine.color}
          numberOfLines={1}
        >
          {subLine.text}
        </Text>
      </YStack>

      {draftDate ? (
        <Text
          width={RECORD_COL_WIDTH}
          textAlign="right"
          fontFamily="$heading"
          fontWeight="800"
          fontSize={14}
          color={BRAND_GOLD_LIGHT}
          numberOfLines={1}
        >
          {draftDate.toUpperCase()}
        </Text>
      ) : (
        <Text
          width={RECORD_COL_WIDTH}
          textAlign="right"
          fontFamily="$heading"
          fontWeight="800"
          fontSize={18}
          color={leadingLive ? BRAND_GOLD_LIGHT : TEXT_PRIMARY}
          fontVariant={['tabular-nums']}
        >
          {recordLabel(summary)}
        </Text>
      )}

      <Text
        width={RANK_COL_WIDTH}
        textAlign="right"
        fontFamily="$heading"
        fontWeight="800"
        fontSize={18}
        color={ranked ? TEXT_PRIMARY : TEXT_TERTIARY}
      >
        {ranked ? (
          <>
            {summary.rank}
            <Text fontSize={11} color={TEXT_TERTIARY}>
              /{summary.totalTeams}
            </Text>
          </>
        ) : (
          '—'
        )}
      </Text>
    </XStack>
  );
}

/* ─── Action buttons ─── */

function LedgerActions({
  onCreateLeague,
  onJoinLeague,
}: {
  onCreateLeague: () => void;
  onJoinLeague: () => void;
}) {
  const labelProps = {
    fontFamily: '$heading' as const,
    fontWeight: '800' as const,
    fontSize: 14,
    letterSpacing: 1.5,
    textAlign: 'center' as const,
  };

  return (
    <XStack gap={8}>
      <XStack
        testID="leagues-create-button"
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor={BRAND_GOLD}
        borderRadius={2}
        padding={13}
        cursor="pointer"
        pressStyle={{ opacity: 0.7 }}
        onPress={onCreateLeague}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') onCreateLeague();
        }}
        accessibilityRole="button"
        accessibilityLabel="Create a league"
      >
        {/* Ink on gold is theme-invariant — the gold fill stays light in both
            themes, so the label keeps the dark canvas color. */}
        <Text {...labelProps} color={BG_DARK}>
          CREATE LEAGUE
        </Text>
      </XStack>
      <XStack
        testID="leagues-add-button"
        flex={1}
        alignItems="center"
        justifyContent="center"
        borderWidth={1}
        borderColor={OUTLINE_STRONG}
        borderRadius={2}
        padding={13}
        cursor="pointer"
        pressStyle={{ opacity: 0.7 }}
        onPress={onJoinLeague}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') onJoinLeague();
        }}
        accessibilityRole="button"
        accessibilityLabel="Join a league"
      >
        <Text {...labelProps} color={TEXT_PRIMARY}>
          JOIN LEAGUE
        </Text>
      </XStack>
    </XStack>
  );
}

/* ─── Screen ─── */

export function LeaguesLedgerScreen({
  leagues = [],
  loading = false,
  topInset = 0,
  onViewLeague,
  onCreateLeague,
  onJoinLeague,
  onBrowseLeagues,
  refreshControl,
}: LeaguesLedgerScreenProps) {
  const rows = useMemo(() => sortLedgerRows(leagues), [leagues]);
  const aggregateRecord = useMemo(
    () => aggregateActiveRecord(leagues),
    [leagues],
  );

  if (loading) {
    return (
      <YStack
        testID="leagues-ledger-loading"
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
        paddingTop={topInset}
      >
        <Spinner size="large" />
      </YStack>
    );
  }

  return (
    <ScrollView
      testID="leagues-ledger-scroll"
      flex={1}
      backgroundColor="$background"
      paddingTop={topInset}
      refreshControl={refreshControl}
    >
      <YStack paddingVertical={24} paddingHorizontal={20} gap={18}>
        <LedgerMasthead
          leagueCount={leagues.length}
          aggregateRecord={aggregateRecord}
        />

        {rows.length === 0 ? (
          <YStack
            testID="leagues-empty-state"
            alignItems="center"
            gap="$4"
            paddingVertical={48}
          >
            <Trophy size={48} color={INDEX_NUMERAL} />
            <Text
              fontFamily="$body"
              fontSize={15}
              color={TEXT_MUTED}
              textAlign="center"
            >
              You are not in any leagues yet.
            </Text>
            <XStack
              testID="leagues-browse-cta"
              alignItems="center"
              justifyContent="center"
              borderWidth={1}
              borderColor={OUTLINE_STRONG}
              borderRadius={2}
              paddingVertical={13}
              paddingHorizontal={24}
              cursor="pointer"
              pressStyle={{ opacity: 0.7 }}
              onPress={onBrowseLeagues}
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') onBrowseLeagues();
              }}
              accessibilityRole="button"
              accessibilityLabel="Browse leagues"
            >
              <Text
                fontFamily="$heading"
                fontWeight="800"
                fontSize={14}
                letterSpacing={1.5}
                color={TEXT_PRIMARY}
              >
                BROWSE LEAGUES
              </Text>
            </XStack>
          </YStack>
        ) : (
          <YStack testID="leagues-list">
            <LedgerColumnHeader />
            {rows.map((summary, index) => (
              <LedgerRow
                key={summary.leagueId ?? `league-${index}`}
                summary={summary}
                index={index}
                onPress={() => onViewLeague(summary)}
              />
            ))}
            <XStack
              testID="leagues-ledger-footer"
              alignItems="center"
              justifyContent="space-between"
              gap="$3"
              marginTop={2}
              paddingVertical={12}
              paddingHorizontal={4}
              borderTopWidth={1}
              borderTopColor={GOLD_RULE}
            >
              <Text
                fontFamily="$body"
                fontStyle="italic"
                fontSize={12}
                color={TEXT_MUTED}
                flexShrink={1}
              >
                Season to date across all leagues
              </Text>
              <Text
                fontFamily="$heading"
                fontWeight="800"
                fontSize={18}
                color={BRAND_GOLD_LIGHT}
                fontVariant={['tabular-nums']}
              >
                {aggregateRecord ?? '—'}
              </Text>
            </XStack>
          </YStack>
        )}

        <LedgerActions
          onCreateLeague={onCreateLeague}
          onJoinLeague={onJoinLeague}
        />
      </YStack>
    </ScrollView>
  );
}
