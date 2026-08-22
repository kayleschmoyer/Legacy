import React, { useMemo } from 'react';
import { Card, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  collectProfileStats,
  FOOTBALL_SCORING_GROUP_ORDER,
  formatMultiplier,
  groupStatsByGroup,
  isStatOverridden,
  SCORING_GROUP_COPY,
  SCORING_GROUP_ORDER,
} from '@legacy-sports/scoring';
import { DefensiveFormat, Sport } from '@legacy-sports/graphql';
import type { LeagueScoringProfile } from './LeagueScoringEditor';

/**
 * Mirrors {@link LeagueScoringEditor}'s `getGroupOrder` — duplicated rather
 * than imported so this read-only card doesn't depend on a sibling module
 * that test suites mock out wholesale.
 */
function getGroupOrder(
  sport: Sport,
  defensiveFormat: DefensiveFormat | string | null | undefined,
): readonly string[] {
  if (sport !== Sport.Football) {
    return SCORING_GROUP_ORDER;
  }

  const isIdp = defensiveFormat === DefensiveFormat.Idp;

  return FOOTBALL_SCORING_GROUP_ORDER.filter((group) => {
    if (group === 'defense') return !isIdp;
    if (group === 'idp') return isIdp;
    return true;
  });
}

interface LeagueScoringReadOnlyProps {
  readonly profile: LeagueScoringProfile | null | undefined;
  readonly loading: boolean;
  readonly error?: Error | null;
  /** Defaults to `Sport.Baseball` to match {@link LeagueScoringEditor}'s default. */
  readonly sport?: Sport;
  /** Football-only. Determines whether the IDP or DST ("defense") stat group renders. */
  readonly defensiveFormat?: DefensiveFormat | string | null;
}

/**
 * Read-only scoring rules card — a member-facing view of the same grouped
 * stat multipliers {@link LeagueScoringEditor} lets commissioners edit.
 * Extracted so any league member (not just the commissioner) can see how
 * points are calculated on native (LS-6327).
 */
export function LeagueScoringReadOnly(
  props: LeagueScoringReadOnlyProps,
): React.JSX.Element {
  const {
    profile,
    loading,
    error,
    sport = Sport.Baseball,
    defensiveFormat,
  } = props;

  const groupOrder = useMemo(
    () => getGroupOrder(sport, defensiveFormat),
    [sport, defensiveFormat],
  );

  const stats = useMemo(() => collectProfileStats(profile), [profile]);
  const groupedStats = useMemo(
    () => groupStatsByGroup(stats, groupOrder),
    [stats, groupOrder],
  );

  if (error) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red7"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$red11">
          Failed to load scoring profile: {error.message}
        </Text>
      </Card>
    );
  }

  if (loading) {
    return (
      <YStack alignItems="center" padding="$4" gap="$2">
        <Spinner size="small" color="$brandNavyLight" />
        <Text fontSize="$3" color="$gray9" role="status">
          Loading scoring profile…
        </Text>
      </YStack>
    );
  }

  if (stats.length === 0) {
    return (
      <Card
        backgroundColor="$yellow2"
        borderColor="$yellow6"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$yellow11">
          No scoring stats are available yet for this league.
        </Text>
      </Card>
    );
  }

  return (
    <YStack gap="$3">
      {groupOrder.map((group) => {
        const statsForGroup = groupedStats[group];
        if (!statsForGroup || statsForGroup.length === 0) return null;
        const copy = SCORING_GROUP_COPY[group];

        return (
          <YStack key={group} gap="$2" role="region" aria-label={copy?.title}>
            <XStack alignItems="center" gap="$2">
              <XStack
                width={3}
                height={16}
                borderRadius={2}
                backgroundColor={copy?.accent ?? '$gray8'}
                flexShrink={0}
              />
              <Text fontSize="$3" fontWeight="700" color="$color12">
                {copy?.title ?? group}
              </Text>
              <Text fontSize="$2" color="$gray8">
                ({statsForGroup.length})
              </Text>
            </XStack>

            <XStack flexWrap="wrap" gap="$2">
              {statsForGroup.map((stat) => {
                const isOverride = isStatOverridden(stat);
                return (
                  <XStack
                    key={stat.id}
                    alignItems="center"
                    gap="$1.5"
                    paddingHorizontal="$2.5"
                    paddingVertical="$1.5"
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={
                      isOverride ? '$brandGoldLight' : '$surfacePanelBorder'
                    }
                    backgroundColor={
                      isOverride ? '$surfaceInteractive' : '$background'
                    }
                  >
                    <Text fontSize="$2" fontWeight="600" color="$color11">
                      {stat.displayName}
                    </Text>
                    <Text
                      fontSize="$3"
                      fontWeight="700"
                      color={isOverride ? '$brandGoldLight' : '$color12'}
                    >
                      {stat.multiplier > 0 ? '+' : ''}
                      {formatMultiplier(stat.multiplier)}x
                    </Text>
                  </XStack>
                );
              })}
            </XStack>
          </YStack>
        );
      })}
    </YStack>
  );
}
