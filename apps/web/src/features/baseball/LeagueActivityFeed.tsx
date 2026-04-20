import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  ArrowLeftRight,
  ChevronRight,
  Clock,
  Filter,
  Shield,
  Trophy,
  UserCheck,
  UserMinus,
} from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import {
  LeagueActivityEventType,
  useGetLeagueActivityQuery,
} from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityType =
  | 'all'
  | 'trade'
  | 'waiver'
  | 'draft_pick'
  | 'lineup_change'
  | 'roster_move'
  | 'commissioner'
  | 'matchup';

interface ActivityItem {
  id: string;
  type: Exclude<ActivityType, 'all'>;
  icon: React.ReactNode;
  title: string;
  detail: string;
  /** ISO timestamp string */
  isoDate: string;
  accentColor: string;
  /** Optional href-like route for click-through */
  linkTo?: string;
}

export interface LeagueActivityFeedProps {
  leagueId: number;
  draftStatus: string;
  currentMatchup?: number | null;
  teamCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function eventToActivityItem(event: {
  id?: string | null;
  leagueId?: number | null;
  eventType?: LeagueActivityEventType | null;
  payload?: string | null;
  occurredAt?: string | null;
  actorUsername?: string | null;
}): ActivityItem | null {
  if (!event.eventType || !event.id) return null;

  let payload: Record<string, unknown> = {};
  if (event.payload != null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.payload);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      LOGGER.warn('Bad activity payload (parse error)', {
        id: event.id,
        eventType: event.eventType,
        payloadLength: event.payload.length,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      // Fall back to an empty payload so the activity item still renders
      // with its default copy instead of being dropped from the feed.
      parsed = {};
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      LOGGER.warn('Bad activity payload (not a plain object)', {
        id: event.id,
        eventType: event.eventType,
        payloadLength: event.payload.length,
        parsedType: parsed === null ? 'null' : typeof parsed,
      });
      // Fall back to an empty payload so the activity item still renders
      // with its default copy instead of being dropped from the feed.
      payload = {};
    } else {
      payload = parsed as Record<string, unknown>;
    }
  }
  const isoDate = event.occurredAt ?? new Date().toISOString();
  const actor = event.actorUsername ?? 'A manager';
  const lid = event.leagueId ?? 0;

  switch (event.eventType) {
    case LeagueActivityEventType.TradeProposed:
      return {
        id: String(event.id),
        type: 'trade',
        icon: <ArrowLeftRight size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Trade proposed',
        detail: `${actor} proposed a trade with another team.`,
        isoDate,
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${lid}/trades`,
      };

    case LeagueActivityEventType.TradeAccepted:
      return {
        id: String(event.id),
        type: 'trade',
        icon: <ArrowLeftRight size={16} color="rgb(34, 197, 94)" />,
        title: 'Trade accepted',
        detail:
          typeof payload['teamAName'] === 'string' &&
          typeof payload['teamBName'] === 'string'
            ? `${payload['teamAName']} and ${payload['teamBName']} completed a trade.`
            : `${actor} accepted a trade offer.`,
        isoDate,
        accentColor: '$green11',
        linkTo: `/leagues/${lid}/trades`,
      };

    case LeagueActivityEventType.TradeRejected:
      return {
        id: String(event.id),
        type: 'trade',
        icon: <ArrowLeftRight size={16} color="rgb(239, 68, 68)" />,
        title: 'Trade rejected',
        detail: `${actor} rejected a trade offer.`,
        isoDate,
        accentColor: '$red11',
        linkTo: `/leagues/${lid}/trades`,
      };

    case LeagueActivityEventType.TradeCancelled:
      return {
        id: String(event.id),
        type: 'trade',
        icon: <ArrowLeftRight size={16} color="rgb(148, 163, 184)" />,
        title: 'Trade cancelled',
        detail: `${actor} cancelled a pending trade.`,
        isoDate,
        accentColor: '$gray11',
        linkTo: `/leagues/${lid}/trades`,
      };

    case LeagueActivityEventType.TradeVetoed:
      return {
        id: String(event.id),
        type: 'trade',
        icon: <Shield size={16} color="rgb(239, 68, 68)" />,
        title: 'Trade vetoed',
        detail: 'The league voted to veto a trade.',
        isoDate,
        accentColor: '$red11',
        linkTo: `/leagues/${lid}/trades`,
      };

    case LeagueActivityEventType.WaiverClaimed: {
      const playerName =
        typeof payload['playerId'] === 'number'
          ? `Player #${payload['playerId']}`
          : 'a player';
      return {
        id: String(event.id),
        type: 'waiver',
        icon: <UserCheck size={16} color="rgb(168, 85, 247)" />,
        title: 'Waiver claim processed',
        detail: `${actor} claimed ${playerName} off waivers.`,
        isoDate,
        accentColor: '$purple11',
        linkTo: `/leagues/${lid}/waivers`,
      };
    }

    case LeagueActivityEventType.WaiverCancelled:
      return {
        id: String(event.id),
        type: 'waiver',
        icon: <UserMinus size={16} color="rgb(148, 163, 184)" />,
        title: 'Waiver claim cancelled',
        detail: `${actor} cancelled a waiver claim.`,
        isoDate,
        accentColor: '$gray11',
        linkTo: `/leagues/${lid}/waivers`,
      };

    case LeagueActivityEventType.DraftPickMade: {
      const round =
        typeof payload['round'] === 'number' ? payload['round'] : '?';
      const pick =
        typeof payload['pickNumber'] === 'number' ? payload['pickNumber'] : '?';
      const teamName =
        typeof payload['teamName'] === 'string' ? payload['teamName'] : null;
      const playerName =
        typeof payload['playerName'] === 'string'
          ? payload['playerName']
          : null;
      const draftActor = teamName ?? actor;
      const detail = playerName
        ? `${draftActor} drafted ${playerName}.`
        : `${draftActor} made their draft selection.`;
      return {
        id: String(event.id),
        type: 'draft_pick',
        icon: <Trophy size={16} color={BRAND_GOLD} />,
        title: `Round ${round}, Pick ${pick}`,
        detail,
        isoDate,
        accentColor: BRAND_GOLD,
        linkTo: `/leagues/${lid}/draft`,
      };
    }

    case LeagueActivityEventType.LeagueAnnouncement: {
      const msgText =
        typeof payload['messageText'] === 'string'
          ? payload['messageText'].slice(0, 80) +
            (payload['messageText'].length > 80 ? '…' : '')
          : 'New announcement from the commissioner.';
      return {
        id: String(event.id),
        type: 'commissioner',
        icon: <Shield size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'League announcement',
        detail: msgText,
        isoDate,
        accentColor: BRAND_GOLD_LIGHT,
      };
    }

    default:
      return null;
  }
}

const TYPE_LABELS: Record<Exclude<ActivityType, 'all'>, string> = {
  trade: 'Trades',
  waiver: 'Waivers',
  draft_pick: 'Draft',
  lineup_change: 'Lineup',
  roster_move: 'Roster',
  commissioner: 'Commissioner',
  matchup: 'Matchups',
};

const FILTER_TABS: { type: ActivityType; label: string }[] = [
  { type: 'all', label: 'All' },
  { type: 'trade', label: 'Trades' },
  { type: 'waiver', label: 'Waivers' },
  { type: 'draft_pick', label: 'Draft' },
  { type: 'commissioner', label: 'Commissioner' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LeagueActivityFeed — Comprehensive league activity timeline showing trades,
 * waiver claims, draft picks, and commissioner announcements.
 * Wired to the real `leagueActivity` GraphQL query (LS-356).
 */
export function LeagueActivityFeed({
  leagueId,
}: LeagueActivityFeedProps): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<ActivityType>('all');

  const { data, loading, error } = useGetLeagueActivityQuery({
    variables: { leagueId, limit: 200 },
    errorPolicy: 'all',
    // The feed aggregates events produced by many different mutations
    // (trades, waivers, announcements, draft picks) across multiple users'
    // sessions. Apollo's normalized cache can't auto-append heterogeneous
    // LeagueActivity records from each source mutation without duplicating
    // server-side formatting, and cross-user writes arrive without any
    // local mutation at all. `cache-and-network` keeps the feed fresh on
    // every mount while still rendering instantly from cache (LS-3769).
    fetchPolicy: 'cache-and-network',
  });

  const activities: ActivityItem[] = useMemo(
    () =>
      (data?.leagueActivity ?? [])
        .map(eventToActivityItem)
        .filter((item): item is ActivityItem => item !== null),
    [data?.leagueActivity],
  );

  const filtered = useMemo(
    () =>
      activeFilter === 'all'
        ? activities
        : activities.filter((a) => a.type === activeFilter),
    [activities, activeFilter],
  );

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      padding="$5"
    >
      {/* Header */}
      <XStack alignItems="center" gap="$2" marginBottom="$4">
        <Clock size={18} color="var(--color)" />
        <Text fontSize="$5" fontWeight="700" color="$color" flex={1}>
          League Activity
        </Text>
        <Filter size={14} color="var(--textMuted)" />
      </XStack>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        marginBottom="$4"
      >
        <XStack gap="$2" paddingBottom="$1">
          {FILTER_TABS.map(({ type, label }) => {
            const isActive = activeFilter === type;
            const count =
              type === 'all'
                ? activities.length
                : activities.filter((a) => a.type === type).length;
            if (count === 0 && type !== 'all') return null;
            return (
              <Button
                key={type}
                size="$2"
                borderRadius="$10"
                paddingHorizontal="$3"
                backgroundColor={
                  isActive
                    ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                    : '$surfaceSubtle'
                }
                borderColor={isActive ? BRAND_NAVY_LIGHT : '$outlineSubtle'}
                borderWidth={1}
                onPress={() => {
                  setActiveFilter(type);
                }}
              >
                <Text
                  fontSize="$2"
                  fontWeight={isActive ? '700' : '500'}
                  color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                >
                  {label}
                  {count > 0 ? ` · ${count}` : ''}
                </Text>
              </Button>
            );
          })}
        </XStack>
      </ScrollView>

      {/* Activity list */}
      <YStack gap="$1">
        {loading && !data ? (
          <YStack paddingVertical="$5" alignItems="center">
            <Spinner size="small" color="$textMuted" />
          </YStack>
        ) : error ? (
          <YStack paddingVertical="$4" alignItems="center">
            <Text fontSize="$3" color="$red10">
              Could not load activity. Please refresh.
            </Text>
          </YStack>
        ) : filtered.length === 0 ? (
          <YStack paddingVertical="$6" alignItems="center" gap="$2">
            <YStack
              width={48}
              height={48}
              borderRadius={24}
              backgroundColor="$surfaceSubtle"
              alignItems="center"
              justifyContent="center"
              marginBottom="$1"
            >
              <Clock size={22} color="$textMuted" />
            </YStack>
            <Text fontSize="$4" fontWeight="600" color="$textMuted">
              No{' '}
              {activeFilter === 'all'
                ? ''
                : `${TYPE_LABELS[activeFilter].toLowerCase()} `}
              activity yet
            </Text>
            <Text
              fontSize="$2"
              color="$textMuted"
              textAlign="center"
              maxWidth={280}
            >
              Activity will appear here once trades, waivers, or draft picks
              happen in your league.
            </Text>
          </YStack>
        ) : (
          filtered.map((activity, idx) => (
            <React.Fragment key={activity.id}>
              <XStack
                gap="$3"
                paddingVertical="$3"
                alignItems="flex-start"
                pressStyle={{ opacity: 0.75 }}
                cursor={activity.linkTo ? 'pointer' : 'default'}
              >
                {/* Icon bubble */}
                <YStack
                  width={32}
                  height={32}
                  borderRadius={16}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  marginTop="$0.5"
                >
                  {activity.icon}
                </YStack>

                {/* Content */}
                <YStack flex={1} gap="$1">
                  <XStack
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap="$2"
                  >
                    <Text
                      fontSize="$3"
                      fontWeight="600"
                      color="$color"
                      flex={1}
                      numberOfLines={2}
                    >
                      {activity.title}
                    </Text>
                    <XStack alignItems="center" gap="$1" flexShrink={0}>
                      <Text
                        fontSize="$1"
                        color="$textMuted"
                        textTransform="uppercase"
                        letterSpacing={0.5}
                      >
                        {formatRelativeDate(activity.isoDate)}
                      </Text>
                      {activity.linkTo ? (
                        <ChevronRight size={12} color="var(--textMuted)" />
                      ) : null}
                    </XStack>
                  </XStack>
                  <Text fontSize="$2" color="$textMuted" lineHeight="$3">
                    {activity.detail}
                  </Text>
                  {/* Type badge */}
                  <Text
                    fontSize="$1"
                    color={activity.accentColor}
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.8}
                    marginTop="$0.5"
                  >
                    {TYPE_LABELS[activity.type]}
                  </Text>
                </YStack>
              </XStack>

              {idx < filtered.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginLeft={44} />
              )}
            </React.Fragment>
          ))
        )}
      </YStack>

      {/* Footer count */}
      {filtered.length > 0 && (
        <XStack
          justifyContent="center"
          marginTop="$3"
          paddingTop="$3"
          borderTopWidth={1}
          borderColor="$outlineSubtle"
        >
          <Text fontSize="$2" color="$textMuted">
            Showing {filtered.length} of {activities.length} event
            {activities.length !== 1 ? 's' : ''}
          </Text>
        </XStack>
      )}
    </Card>
  );
}
