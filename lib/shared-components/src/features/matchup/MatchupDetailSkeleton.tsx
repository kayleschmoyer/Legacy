import React from 'react';
import { Card, XStack, YStack } from 'tamagui';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';

const HERO_HEIGHT = 260;
const ROSTER_ROW_COUNT = 4;
const RECAP_HEIGHT = 180;

/**
 * MatchupDetailSkeleton — loading placeholder for the matchup detail page.
 *
 * Mirrors MatchupDetailLayout's section order and approximate section
 * heights (nav controls, scoreboard hero, games remaining, roster
 * comparison, recap) so the page doesn't jump/reflow when real content
 * replaces it — reducing Cumulative Layout Shift on first paint (BMD-029).
 */
export function MatchupDetailSkeleton(): React.JSX.Element {
  return (
    <YStack
      width="100%"
      maxWidth={1200}
      alignSelf="center"
      padding="$4"
      $sm={{ padding: '$2' }}
      gap="$4"
      aria-label="Loading matchup details"
    >
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Skeleton width={120} height={32} radius={8} />
        <Skeleton width={200} height={32} radius={8} />
        <Skeleton width={120} height={32} radius={8} />
      </XStack>

      <Card
        overflow="hidden"
        borderRadius="$6"
        borderWidth={1}
        borderColor="$borderColor"
        backgroundColor="$surfaceCard"
        width="100%"
        maxWidth={800}
        alignSelf="center"
        height={HERO_HEIGHT}
        padding="$4"
        justifyContent="center"
      >
        <XStack alignItems="center" justifyContent="center" gap="$6">
          <YStack alignItems="center" gap="$2">
            <Skeleton width={52} height={52} radius={26} />
            <Skeleton width={90} height={16} />
            <Skeleton width={60} height={40} />
          </YStack>
          <Skeleton width={24} height={24} />
          <YStack alignItems="center" gap="$2">
            <Skeleton width={52} height={52} radius={26} />
            <Skeleton width={90} height={16} />
            <Skeleton width={60} height={40} />
          </YStack>
        </XStack>
      </Card>

      <Skeleton width="100%" height={28} radius={8} />

      <Card
        overflow="hidden"
        borderRadius="$6"
        borderWidth={1}
        borderColor="$borderColor"
        width="100%"
      >
        {Array.from({ length: ROSTER_ROW_COUNT }).map((_, index) => (
          <SkeletonRow key={index} />
        ))}
      </Card>

      <Card
        overflow="hidden"
        borderRadius="$6"
        borderWidth={1}
        borderColor="$borderColor"
        width="100%"
        height={RECAP_HEIGHT}
        padding="$4"
        gap="$3"
      >
        <Skeleton width="60%" height={20} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="75%" height={14} />
      </Card>
    </YStack>
  );
}
