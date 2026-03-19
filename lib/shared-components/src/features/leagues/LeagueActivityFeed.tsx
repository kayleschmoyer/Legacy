import React, { useMemo } from 'react';
import { Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { useGetLeagueActivityQuery } from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

export interface LeagueActivityFeedProps {
  leagueId: number;
  limit?: number;
}

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

const EVENT_LABELS: Record<string, string> = {
  TRADE_COMPLETED: 'Trade',
  WAIVER_CLAIM: 'Waiver',
  DRAFT_PICK: 'Draft',
  LINEUP_CHANGE: 'Lineup',
  ROSTER_MOVE: 'Roster',
  COMMISSIONER_ACTION: 'Commissioner',
  MATCHUP_COMPLETED: 'Matchup',
};

/**
 * LeagueActivityFeed - Cross-platform activity timeline for a league.
 * Shows recent trades, waiver claims, draft picks, lineup changes, etc.
 */
export function LeagueActivityFeed({
  leagueId,
  limit = 20,
}: LeagueActivityFeedProps) {
  const { data, loading, error } = useGetLeagueActivityQuery({
    variables: { leagueId, limit },
    fetchPolicy: 'cache-and-network',
  });

  const events = useMemo(
    () => data?.leagueActivity ?? [],
    [data?.leagueActivity],
  );

  if (loading && events.length === 0) {
    return (
      <YStack padding="$4" alignItems="center">
        <Spinner />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack padding="$4">
        <Text color="$red10">Failed to load activity feed</Text>
      </YStack>
    );
  }

  if (events.length === 0) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray10">No activity yet</Text>
      </YStack>
    );
  }

  return (
    <YStack space="$2">
      {events.map((event, index) => (
        <Card
          key={event.id ?? `${event.occurredAt ?? 'unknown'}-${index}`}
          backgroundColor="$gray2"
          padding="$3"
          borderRadius="$3"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <XStack alignItems="center" gap="$2" flex={1}>
              <Text
                fontSize="$2"
                fontWeight="700"
                backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                color={BRAND_NAVY_LIGHT}
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius="$2"
              >
                {EVENT_LABELS[event.eventType ?? ''] ?? event.eventType}
              </Text>
              <Text fontSize="$3" color="$gray12" flex={1} numberOfLines={2}>
                {event.actorUsername
                  ? `${event.actorUsername}: ${event.eventType?.toLowerCase().replace(/_/g, ' ') ?? ''}`
                  : (event.eventType?.toLowerCase().replace(/_/g, ' ') ?? '')}
              </Text>
            </XStack>
            <Text fontSize="$2" color="$gray10" marginLeft="$2">
              {event.occurredAt
                ? formatRelativeDate(String(event.occurredAt))
                : ''}
            </Text>
          </XStack>
        </Card>
      ))}
    </YStack>
  );
}
