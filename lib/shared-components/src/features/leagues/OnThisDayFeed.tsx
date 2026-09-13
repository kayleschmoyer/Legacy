/**
 * OnThisDayFeed — "On This Day in Baseball History" widget.
 *
 * Surfaces notable batting/pitching game-log performances that occurred on
 * today's calendar date (month + day) across all seasons in the database,
 * plus off-season events (signings, trades) from the on_this_day_events table.
 */
import React, { useMemo, useState } from 'react';
import { Separator, Spinner, styled, Text, XStack, YStack } from 'tamagui';
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { Calendar } from '@tamagui/lucide-icons/icons/Calendar';
import { ChevronRight } from '@tamagui/lucide-icons/icons/ChevronRight';
import { TrendingUp } from '@tamagui/lucide-icons/icons/TrendingUp';
import { Zap } from '@tamagui/lucide-icons/icons/Zap';
import {
  cleanDescription,
  extractPlayerNameFromDescription,
  stripDiacritics,
} from '@legacy-sports/utils';
import {
  useGetOnThisDayEventsQuery,
  useGetOnThisDayQuery,
} from '@legacy-sports/graphql';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '../../utils/colors';

// ─── Styled components ───────────────────────────────────────────────────────

const FeedContainer = styled(YStack, {
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
  animation: 'medium',
  hoverStyle: { borderColor: '$glassBorderHover' },
});

const FeedHeader = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const EntryRow = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  gap: '$3',
  cursor: 'pointer',
  animation: 'quick',
  hoverStyle: {
    backgroundColor: '$surfaceInteractive',
  },
  pressStyle: {
    backgroundColor: '$accentMuted',
    scale: 0.99,
  },
});

const StatBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$1',
  paddingHorizontal: '$2',
  paddingVertical: '$0.5',
  borderRadius: '$3',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$glassBorder',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Ordinal suffix: 1st, 2nd, 3rd, 4th … */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Month names for the date header. */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Human-readable label for an MLB transaction type code. */
function eventTypeLabel(code: string): string {
  switch (code) {
    case 'TR':
      return 'Trade';
    case 'SFA':
      return 'Signed';
    case 'CE':
    case 'EX':
      return 'Extension';
    default:
      return code;
  }
}

type Entry = NonNullable<
  NonNullable<ReturnType<typeof useGetOnThisDayQuery>['data']>['onThisDay']
>[number];

/**
 * Payload passed to {@link OnThisDayFeedProps.onPlayerPress} — widened from a
 * bare `playerId` (LS-9763) so consumers can deep-link straight to the game
 * the entry is about, rather than the player's generic profile page.
 */
export interface OnThisDayPlayerPress {
  playerId: number;
  brefId: string | null | undefined;
  season: number | string | null | undefined;
  gameIdentifier: string | null | undefined;
  /** ISO `YYYY-MM-DD` date parsed from `gameIdentifier`, or `null` if it
   *  couldn't be parsed. See {@link parseGameIdentifierDate}. */
  gameDate: string | null;
}

/**
 * Parse the ISO game date out of a bref-style `gameIdentifier`
 * (`TTTYYYYMMDDN` — 3-char team code, 4-digit year, 2-digit month, 2-digit
 * day, 1-digit doubleheader index; e.g. `NYA192709300` → `1927-09-30`). The
 * date lives at characters 8-11 (1-indexed), matching the
 * `SUBSTRING(gameIdentifier, 8, 2)` / `SUBSTRING(gameIdentifier, 10, 2)`
 * month/day extraction in `StatisticsService.ts`.
 *
 * Returns `null` for a missing or malformed identifier rather than throwing,
 * since callers use this to build an optional deep-link.
 */
export function parseGameIdentifierDate(
  gameIdentifier: string | null | undefined,
): string | null {
  if (!gameIdentifier || gameIdentifier.length < 11) return null;
  const year = gameIdentifier.slice(3, 7);
  const month = gameIdentifier.slice(7, 9);
  const day = gameIdentifier.slice(9, 11);
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

/**
 * Build a one-line summary string for a batting entry.
 * e.g.  "3-for-4, 2 HR, 5 RBI"
 */
function battingSummary(entry: Entry): string {
  const parts: string[] = [];
  if (entry.hits != null && entry.atBats != null) {
    parts.push(`${entry.hits}-for-${entry.atBats}`);
  }
  if (entry.homeRuns) parts.push(`${entry.homeRuns} HR`);
  if (entry.rbi) parts.push(`${entry.rbi} RBI`);
  if (entry.doubles) parts.push(`${entry.doubles} 2B`);
  if (entry.triples) parts.push(`${entry.triples} 3B`);
  if (entry.runs) parts.push(`${entry.runs} R`);
  return parts.join(', ');
}

/**
 * Build a one-line summary string for a pitching entry.
 * e.g.  "8.0 IP, 12 K, 0 ER (SHO)"
 */
function pitchingSummary(entry: Entry): string {
  const parts: string[] = [];
  if (entry.inningsPitched != null) parts.push(`${entry.inningsPitched} IP`);
  if (entry.strikeouts) parts.push(`${entry.strikeouts} K`);
  if (entry.earnedRuns != null) parts.push(`${entry.earnedRuns} ER`);
  if (entry.wins) parts.push('W');
  if (entry.saves) parts.push('SV');
  return parts.join(', ');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Maximum number of items to fetch from the server for the random pool. */
const POOL_LIMIT = 50;
/** Number of items displayed in the widget after random selection. */
const DISPLAY_LIMIT = 3;
/**
 * The server returns `onThisDay` entries ranked by fantasy score (highest
 * first — LS-8670). Random-sampling from only the front of that ranked
 * pool, rather than the full POOL_LIMIT, keeps the widget's rotation
 * feature while ensuring every entry it can surface is a genuinely
 * impressive performance.
 */
const PRIORITY_POOL_LIMIT = 12;

/**
 * Unbiased Fisher–Yates random sample.
 * Picks `n` items from `arr` without replacement.
 * Returns a new array; does not mutate the input.
 */
function fisherYatesSample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface EntryIconProps {
  type: string | null | undefined;
}

function EntryIcon({ type }: EntryIconProps) {
  const isBatting = type === 'batting';
  const color = isBatting ? BRAND_GOLD : BRAND_SEAM_RED_LIGHT;
  return (
    <YStack
      width={36}
      height={36}
      borderRadius={9999}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      style={{
        background: isBatting
          ? `radial-gradient(circle, ${withAlpha(BRAND_GOLD, 0.18)}, ${withAlpha(BG_DARK, 0.6)})`
          : `radial-gradient(circle, ${withAlpha(BRAND_SEAM_RED, 0.2)}, ${withAlpha(BG_DARK, 0.6)})`,
        border: `1px solid ${withAlpha(color, 0.35)}`,
      }}
    >
      {isBatting ? (
        <TrendingUp size={16} color={color} />
      ) : (
        <Zap size={16} color={color} />
      )}
    </YStack>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface OnThisDayFeedProps {
  /**
   * Callback when a player entry is tapped. Consumers handle navigation.
   * Receives the full entry context (not just `playerId`) so a consumer can
   * deep-link to the specific game the entry is about (LS-9763).
   */
  onPlayerPress?: (params: OnThisDayPlayerPress) => void;
  /**
   * Renders only the single top-ranked entry plus a "More ›" control that
   * expands to the full feed in place. Used by the compact mobile Home layout
   * (LS-8794); off by default, so the web dashboard is unchanged.
   */
  condensed?: boolean;
}

export function OnThisDayFeed({
  onPlayerPress,
  condensed = false,
}: OnThisDayFeedProps = {}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isCondensed = condensed && !expanded;
  const today = useMemo(() => new Date(), []);
  const month = today.getMonth() + 1; // 1-indexed
  const day = today.getDate();

  const { data, loading, error } = useGetOnThisDayQuery({
    variables: { month, day, limit: POOL_LIMIT },
    // Cache for 1 hour — content is stable for any given calendar date.
    fetchPolicy: 'cache-first',
  });

  const { data: eventsData, loading: eventsLoading } =
    useGetOnThisDayEventsQuery({
      variables: { month, day, limit: POOL_LIMIT },
      fetchPolicy: 'cache-first',
    });

  const entries = useMemo(() => data?.onThisDay ?? [], [data]);
  const events = useMemo(() => eventsData?.onThisDayEvents ?? [], [eventsData]);

  // Randomly select DISPLAY_LIMIT items from each section so the widget stays
  // concise and shows different highlights on each visit. `entries` is
  // ranked by fantasy score, so sampling only the top of that ranking
  // (rather than the full pool) keeps the rotation limited to the most
  // impressive performances (LS-8670).
  const displayedEntries = useMemo(() => {
    const priorityPool = entries.slice(0, PRIORITY_POOL_LIMIT);
    // Condensed mode shows the single highest-ranked entry rather than a
    // random sample, so the one performance on screen is always the best one.
    if (isCondensed) return priorityPool.slice(0, 1);
    return priorityPool.length <= DISPLAY_LIMIT
      ? priorityPool
      : fisherYatesSample(priorityPool, DISPLAY_LIMIT);
  }, [entries, isCondensed]);
  const displayedEvents = useMemo(() => {
    if (isCondensed) return [];
    return events.length <= DISPLAY_LIMIT
      ? [...events]
      : fisherYatesSample(events, DISPLAY_LIMIT);
  }, [events, isCondensed]);

  /** Whether condensed mode is actually hiding something worth expanding to. */
  const hasMoreToShow =
    isCondensed && (entries.length > 1 || events.length > 0);

  const dateLabel = `${MONTH_NAMES[month - 1]} ${ordinal(day)}`;

  const containerStyle: React.CSSProperties = {
    background: BG_DARK,
    borderTop: `2px solid ${withAlpha(BRAND_GOLD, 0.55)}`,
  };

  return (
    <FeedContainer style={containerStyle}>
      {/* Header */}
      <FeedHeader>
        <YStack
          width={40}
          height={40}
          borderRadius="$5"
          alignItems="center"
          justifyContent="center"
          style={{
            background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.5)}, ${withAlpha(BRAND_GOLD, 0.2)})`,
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.3)}`,
          }}
        >
          <Calendar size={20} color={BRAND_GOLD_LIGHT} />
        </YStack>

        <YStack flex={1} gap="$0.5">
          <Text fontSize="$6" fontWeight="700" color="$color">
            On This Day
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Baseball history — {dateLabel}
          </Text>
        </YStack>
      </FeedHeader>

      {/* Body */}
      {loading && (
        <YStack
          alignItems="center"
          justifyContent="center"
          paddingVertical="$8"
          gap="$3"
        >
          <Spinner size="large" color={BRAND_GOLD} />
          <Text fontSize="$3" color="$textMuted">
            Loading history…
          </Text>
        </YStack>
      )}

      {error && (
        <YStack
          alignItems="center"
          justifyContent="center"
          paddingVertical="$6"
        >
          <Text fontSize="$3" color="$textMuted" textAlign="center">
            Could not load historical data.
          </Text>
        </YStack>
      )}

      {!loading &&
        !error &&
        entries.length === 0 &&
        events.length === 0 &&
        !eventsLoading && (
          <YStack
            alignItems="center"
            justifyContent="center"
            paddingVertical="$6"
          >
            <Text fontSize="$3" color="$textMuted" textAlign="center">
              No notable performances found for {dateLabel}.
            </Text>
          </YStack>
        )}

      {!loading && !error && displayedEntries.length > 0 && (
        <YStack>
          {displayedEntries.map((entry, idx) => {
            const isBatting = entry.entryType === 'batting';
            const summary = isBatting
              ? battingSummary(entry)
              : pitchingSummary(entry);
            const accentColor = isBatting
              ? BRAND_GOLD_LIGHT
              : BRAND_SEAM_RED_LIGHT;
            const playerName =
              `${entry.firstName ?? ''} ${entry.lastName ?? ''}`.trim();
            const season = entry.season ?? '';

            return (
              <React.Fragment
                key={`${entry.playerId ?? 0}-${entry.gameIdentifier ?? idx}`}
              >
                {idx > 0 && (
                  <Separator
                    backgroundColor={withAlpha(BRAND_NAVY, 0.4)}
                    marginHorizontal="$4"
                  />
                )}
                <EntryRow
                  onPress={() => {
                    if (entry.playerId && onPlayerPress) {
                      onPlayerPress({
                        playerId: entry.playerId,
                        brefId: entry.brefId,
                        season: entry.season,
                        gameIdentifier: entry.gameIdentifier,
                        gameDate: parseGameIdentifierDate(entry.gameIdentifier),
                      });
                    }
                  }}
                  // LS-9763 — the row now deep-links to this specific game
                  // (where a consumer supports it) rather than the player's
                  // generic profile, so the label describes that destination.
                  accessibilityLabel={`View ${playerName} game details`}
                  role="link"
                >
                  <EntryIcon type={entry.entryType} />

                  <YStack flex={1} gap="$0.5" minWidth={0}>
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      <Text
                        fontSize="$4"
                        fontWeight="700"
                        color="$color"
                        numberOfLines={1}
                      >
                        {playerName}
                      </Text>
                      <StatBadge>
                        <Text
                          fontSize="$1"
                          fontWeight="600"
                          color={accentColor}
                        >
                          {season}
                        </Text>
                      </StatBadge>
                    </XStack>

                    <Text fontSize="$3" color="$textMuted" numberOfLines={1}>
                      {summary}
                    </Text>
                  </YStack>

                  <ChevronRight
                    size={16}
                    color={withAlpha(BRAND_GOLD, 0.5)}
                    flexShrink={0}
                  />
                </EntryRow>
              </React.Fragment>
            );
          })}
        </YStack>
      )}

      {/* Events section: signings, trades, extensions */}
      {!eventsLoading && displayedEvents.length > 0 && (
        <YStack>
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$5"
            paddingVertical="$2"
            borderTopWidth={displayedEntries.length > 0 ? 1 : 0}
            borderTopColor={withAlpha(BRAND_NAVY, 0.5)}
            style={{ background: withAlpha(BRAND_NAVY, 0.3) }}
          >
            <ArrowLeftRight size={12} color={withAlpha(BRAND_GOLD, 0.7)} />
            <Text
              fontSize="$2"
              fontWeight="600"
              color={withAlpha(BRAND_GOLD_LIGHT, 0.8)}
            >
              Transactions &amp; Signings
            </Text>
          </XStack>

          {displayedEvents.map((event, idx) => {
            const label = eventTypeLabel(event.eventType ?? '');
            const accentColor =
              event.eventType === 'TR'
                ? BRAND_SEAM_RED_LIGHT
                : BRAND_GOLD_LIGHT;
            const displayName =
              event.playerName ||
              extractPlayerNameFromDescription(event.description ?? '');

            const description = (() => {
              let desc = cleanDescription(event.description ?? '');
              if (
                event.playerName &&
                /[\u0080-\uFFFF]/.test(event.playerName)
              ) {
                // Replace ASCII-only player name with accented canonical name.
                // Uses stripDiacritics (not String.prototype.normalize, which
                // is unimplemented on Hermes/React Native \u2014 LS-7946).
                const ascii = stripDiacritics(event.playerName);
                desc = desc.replace(ascii, event.playerName);
              }
              return desc;
            })();

            return (
              <React.Fragment key={event.id ?? idx}>
                {idx > 0 && (
                  <Separator
                    backgroundColor={withAlpha(BRAND_NAVY, 0.4)}
                    marginHorizontal="$4"
                  />
                )}
                <XStack
                  alignItems="flex-start"
                  paddingHorizontal="$5"
                  paddingVertical="$3"
                  gap="$3"
                >
                  <YStack
                    width={36}
                    height={36}
                    borderRadius={9999}
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    style={{
                      background: `radial-gradient(circle, ${withAlpha(accentColor, 0.18)}, ${withAlpha(BG_DARK, 0.6)})`,
                      border: `1px solid ${withAlpha(accentColor, 0.35)}`,
                    }}
                  >
                    <ArrowLeftRight size={14} color={accentColor} />
                  </YStack>

                  <YStack flex={1} gap="$0.5" minWidth={0}>
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      {displayName && (
                        <Text
                          fontSize="$4"
                          fontWeight="700"
                          color="$color"
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                      )}
                      <StatBadge>
                        <Text
                          fontSize="$1"
                          fontWeight="600"
                          color={accentColor}
                        >
                          {label} · {event.year}
                        </Text>
                      </StatBadge>
                    </XStack>
                    <Text fontSize="$3" color="$textMuted" numberOfLines={2}>
                      {description}
                    </Text>
                  </YStack>
                </XStack>
              </React.Fragment>
            );
          })}
        </YStack>
      )}

      {/* Condensed mode: expand in place to the full feed (LS-8794). */}
      {hasMoreToShow && (
        <XStack
          testID="on-this-day-more"
          accessibilityRole="button"
          accessibilityLabel="Show more On This Day entries"
          onPress={() => setExpanded(true)}
          alignItems="center"
          justifyContent="center"
          gap="$1"
          paddingVertical="$3"
          borderTopWidth={1}
          borderTopColor="$glassBorder"
          cursor="pointer"
          pressStyle={{ opacity: 0.7 }}
        >
          <Text fontSize="$2" fontWeight="700" color="$textMuted">
            More
          </Text>
          <ChevronRight size={14} color="$textMuted" />
        </XStack>
      )}
    </FeedContainer>
  );
}

export default OnThisDayFeed;
