import React from 'react';
import { Card, styled, Text, XStack, YStack } from 'tamagui';
import { CheckCircle2, Circle, Hourglass } from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT } from '../../constants/colors';

export interface GamesRemainingProps {
  gamesRemaining: number;
  totalGames: number;
  compact?: boolean;
}

// ── Styled Components ─────────────────────────────────────────────────────────

const ProgressCard = styled(Card, {
  overflow: 'hidden',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  backgroundColor: '$surfacePanel',
});

const GameDot = styled(YStack, {
  width: 28,
  height: 28,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
});

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * GamesRemaining - Modern progress visualization for matchup games
 * Shows game dots and a progress bar with clean styling
 */
export function GamesRemaining({
  gamesRemaining,
  totalGames,
  compact = false,
}: GamesRemainingProps) {
  const gamesCompleted = totalGames - gamesRemaining;
  const progressPercentage =
    totalGames > 0 ? (gamesCompleted / totalGames) * 100 : 0;
  const allComplete = gamesRemaining === 0;

  if (compact) {
    return (
      <XStack alignItems="center" gap="$2">
        <YStack
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={allComplete ? '$green9' : '$orange9'}
        />
        <Text
          fontSize="$2"
          fontWeight="600"
          color={allComplete ? '$green10' : '$orange10'}
        >
          {allComplete ? 'Complete' : `${gamesRemaining} games left`}
        </Text>
      </XStack>
    );
  }

  return (
    <ProgressCard padding="$4">
      <YStack gap="$3">
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$3" fontWeight="700" color="$color">
            Games Progress
          </Text>
          <XStack
            alignItems="center"
            gap="$1.5"
            paddingHorizontal="$3"
            paddingVertical="$1"
            borderRadius="$10"
            backgroundColor={allComplete ? '$green3' : '$orange3'}
          >
            <Text
              fontSize="$2"
              fontWeight="700"
              color={allComplete ? '$green10' : '$orange10'}
            >
              {allComplete ? 'Complete' : `${gamesRemaining} left`}
            </Text>
          </XStack>
        </XStack>

        {/* Game Dots */}
        <XStack
          justifyContent="center"
          gap="$2"
          flexWrap="wrap"
          paddingVertical="$1"
        >
          {Array.from({ length: totalGames }).map((_, i) => {
            const isCompleted = i < gamesCompleted;
            const isCurrent = i === gamesCompleted && !allComplete;
            return (
              <GameDot
                key={i}
                backgroundColor={
                  isCompleted ? '$green3' : isCurrent ? '$orange3' : '$gray3'
                }
                borderColor={
                  isCompleted ? '$green8' : isCurrent ? '$orange8' : '$gray6'
                }
              >
                {isCompleted ? (
                  <CheckCircle2 size={14} color="var(--green10)" />
                ) : isCurrent ? (
                  <Hourglass size={14} color="var(--orange10)" />
                ) : (
                  <Circle size={14} color="var(--gray8)" />
                )}
              </GameDot>
            );
          })}
        </XStack>

        {/* Progress bar */}
        <YStack gap="$1.5">
          <YStack
            height={6}
            width="100%"
            backgroundColor="$gray4"
            borderRadius="$10"
            overflow="hidden"
          >
            <YStack
              height="100%"
              width={`${progressPercentage}%`}
              backgroundColor={allComplete ? '$green9' : BRAND_NAVY_LIGHT}
              borderRadius="$10"
              animation="quick"
            />
          </YStack>

          <XStack justifyContent="space-between">
            <Text fontSize="$1" color="$textMuted" fontWeight="500">
              {gamesCompleted} completed
            </Text>
            <Text fontSize="$1" color="$textMuted" fontWeight="500">
              {totalGames} total
            </Text>
          </XStack>
        </YStack>
      </YStack>
    </ProgressCard>
  );
}
