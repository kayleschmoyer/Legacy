/**
 * OnThisDayFeed — "On This Day in Baseball History" widget.
 *
 * Surfaces notable batting/pitching game-log performances that occurred on
 * today's calendar date (month + day) across all seasons in the database,
 * plus off-season events (signings, trades) from the on_this_day_events table.
 */
import React, { useMemo } from 'react';
import { Separator, Spinner, styled, Text, XStack, YStack } from 'tamagui';
import {
  ArrowLeftRight,
  Calendar,
  ChevronRight,
  TrendingUp,
  Zap,
} from '@tamagui/lucide-icons';
import {
  cleanDescription,
  extractPlayerNameFromDescription,
} from '@legacy-sports/utils';
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
import {
  useGetOnThisDayEventsQuery,
  useGetOnThisDayQuery,
} from '../../api/db/graphql.generated';

// ─── Styled components ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
const FeedContainer = styled(YStack, {
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
  animation: 'medium',
  hoverStyle: { borderColor: '$glassBorderHover' },
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
const FeedHeader = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
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
  /** Callback when a player entry is tapped. Consumers handle navigation. */
  onPlayerPress?: (playerId: number) => void;
}

export function OnThisDayFeed({
  onPlayerPress,
}: OnThisDayFeedProps = {}): React.JSX.Element {
  const today = useMemo(() => new Date(), []);
  const month = today.getMonth() + 1; // 1-indexed
  const day = today.getDate();

  const { data, loading, error } = useGetOnThisDayQuery({
    variables: { month, day, limit: 15 },
    // Cache for 1 hour — content is stable for any given calendar date.
    fetchPolicy: 'cache-first',
  });

  const { data: eventsData, loading: eventsLoading } =
    useGetOnThisDayEventsQuery({
      variables: { month, day, limit: 20 },
      fetchPolicy: 'cache-first',
    });

  const entries = data?.onThisDay ?? [];
  const events = eventsData?.onThisDayEvents ?? [];

  const dateLabel = `${MONTH_NAMES[month - 1]} ${ordinal(day)}`;

  const containerStyle: React.CSSProperties = {
    background: `linear-gradient(145deg, ${withAlpha(BG_DARK, 0.88)} 0%, ${withAlpha(BRAND_NAVY, 0.28)} 100%)`,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
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

      {!loading && !error && entries.length > 0 && (
        <YStack>
          {entries.map((entry, idx) => {
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
                      onPlayerPress(entry.playerId);
                    }
                  }}
                  accessibilityLabel={`View ${playerName} profile`}
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
      {!eventsLoading && events.length > 0 && (
        <YStack>
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$5"
            paddingVertical="$2"
            borderTopWidth={entries.length > 0 ? 1 : 0}
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

          {events.map((event, idx) => {
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
                // Replace ASCII-only player name with accented canonical name
                const ascii = event.playerName
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '');
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
    </FeedContainer>
  );
}

export default OnThisDayFeed;
