import React from 'react';
import { Spinner, styled, Text, XStack, YStack } from 'tamagui';
import { AlertCircle, Calendar, Swords } from '@tamagui/lucide-icons';
import { MatchupCard } from './MatchupCard';
import { type MatchupFragment } from '../../api/db/graphql.generated';

export interface MatchupGridProps {
  matchups: MatchupFragment[];
  loading?: boolean;
  error?: Error | null;
  onMatchupPress?: (matchup: MatchupFragment) => void;
  weekNumber?: number;
}

// ── Styled Components ─────────────────────────────────────────────────────────

const GridContainer = styled(YStack, {
  width: '100%',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  backgroundColor: '$background',
  overflow: 'hidden',
});

const GridHeader = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  backgroundColor: '$surfacePanel',
  borderBottomWidth: 1,
  borderBottomColor: '$surfacePanelBorder',
});

const CountBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  backgroundColor: '$blue3',
  borderWidth: 1,
  borderColor: '$blue7',
});

const EmptyState = styled(YStack, {
  padding: '$8',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 240,
  gap: '$3',
});

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * MatchupGrid - Modern grid panel displaying multiple matchups for a week
 * Contained design with header, responsive card grid, and polished empty states
 */
export function MatchupGrid({
  matchups,
  loading = false,
  error = null,
  onMatchupPress,
  weekNumber,
}: MatchupGridProps) {
  if (loading) {
    return (
      <GridContainer>
        <EmptyState>
          <Spinner size="large" color="$blue9" />
          <Text color="$textMuted" fontSize="$3" marginTop="$1">
            Loading matchups...
          </Text>
        </EmptyState>
      </GridContainer>
    );
  }

  if (error) {
    return (
      <GridContainer borderColor="$red6">
        <EmptyState>
          <YStack
            width={48}
            height={48}
            borderRadius={24}
            backgroundColor="$red3"
            alignItems="center"
            justifyContent="center"
          >
            <AlertCircle size={24} color="var(--red10)" />
          </YStack>
          <Text color="$red11" fontSize="$4" fontWeight="600">
            Error loading matchups
          </Text>
          <Text color="$red10" fontSize="$3" textAlign="center" maxWidth={360}>
            {error.message}
          </Text>
        </EmptyState>
      </GridContainer>
    );
  }

  if (matchups.length === 0) {
    return (
      <GridContainer>
        {weekNumber && (
          <GridHeader>
            <XStack alignItems="center" gap="$2">
              <Calendar size={18} color="var(--color)" />
              <Text fontSize="$5" fontWeight="700" color="$color">
                Week {weekNumber}
              </Text>
            </XStack>
          </GridHeader>
        )}
        <EmptyState>
          <YStack
            width={56}
            height={56}
            borderRadius={28}
            backgroundColor="$gray3"
            alignItems="center"
            justifyContent="center"
          >
            <Swords size={28} color="var(--textMuted)" />
          </YStack>
          <Text color="$textMuted" fontSize="$4" fontWeight="600">
            No matchups yet
          </Text>
          <Text
            color="$textMuted"
            fontSize="$3"
            textAlign="center"
            maxWidth={300}
          >
            {weekNumber
              ? `Week ${weekNumber} matchups will appear here once scheduled.`
              : 'Matchups will appear here once scheduled.'}
          </Text>
        </EmptyState>
      </GridContainer>
    );
  }

  return (
    <GridContainer>
      {/* Header */}
      {weekNumber && (
        <GridHeader>
          <XStack alignItems="center" gap="$2.5">
            <Calendar size={18} color="var(--color)" />
            <Text fontSize="$5" fontWeight="700" color="$color">
              Week {weekNumber}
            </Text>
          </XStack>
          <CountBadge>
            <Text fontSize="$2" fontWeight="700" color="$blue11">
              {matchups.length} matchup{matchups.length !== 1 ? 's' : ''}
            </Text>
          </CountBadge>
        </GridHeader>
      )}

      {/* Card Grid */}
      <YStack padding="$4">
        <XStack flexWrap="wrap" justifyContent="flex-start" gap="$3">
          {matchups.map((matchup) => (
            <YStack
              key={matchup.id}
              width="100%"
              $gtSm={{ width: 'calc(50% - 12px)' }}
              $gtLg={{ width: 'calc(33.333% - 12px)' }}
            >
              <MatchupCard
                matchup={matchup}
                onPress={() => onMatchupPress?.(matchup)}
                showWeek={!weekNumber}
              />
            </YStack>
          ))}
        </XStack>
      </YStack>
    </GridContainer>
  );
}
