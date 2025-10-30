import React from 'react';
import { Card, H4, Paragraph, Text, XStack, YStack } from 'tamagui';
import { TrendingUp } from '@tamagui/lucide-icons';
import { PlayerFragment } from './PlayersApi';

const formatProjectionValue = (value?: number | null): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(1);
  }

  return '—';
};

export interface PlayerCardProps {
  player: PlayerFragment;
  onPlayerClick?: (player: PlayerFragment) => void;
  /** Projected fantasy points per game (optional) */
  projectedPoints?: number | null;
  /** Whether to show the projection section */
  showProjection?: boolean;
}

function PlayerCard({
  player,
  onPlayerClick,
  projectedPoints,
  showProjection = true,
}: PlayerCardProps) {
  return (
    <Card
      elevate
      size="$4"
      bordered
      animation="bouncy"
      scale={0.9}
      hoverStyle={{ scale: 0.925 }}
      pressStyle={{ scale: 0.875 }}
      onPress={() => onPlayerClick?.(player)}
      cursor={onPlayerClick ? 'pointer' : 'default'}
      bg="$background"
      borderColor="$borderColor"
      mb="$2"
    >
      <Card.Header>
        <H4 color="$color" numberOfLines={1}>
          {`${player.firstName} ${player.lastName}`}
        </H4>
      </Card.Header>

      <Card.Footer>
        <YStack gap="$2" flex={1}>
          <XStack flex={1} jc="space-between" ai="center">
            <Paragraph theme="alt2" size={2}>
              ID: {player.id}
            </Paragraph>
            <Paragraph theme="alt2" size={2} fontFamily="$mono">
              {player.brefId}
            </Paragraph>
          </XStack>

          {showProjection && projectedPoints !== undefined && (
            <XStack
              jc="space-between"
              ai="center"
              bg="$blue2"
              p="$2"
              borderRadius="$2"
              borderWidth={1}
              borderColor="$blue6"
            >
              <XStack ai="center" gap="$1">
                <TrendingUp size={14} color="$blue10" />
                <Text fontSize="$2" color="$blue11" fontWeight="600">
                  Projected
                </Text>
              </XStack>
              <Text fontSize="$3" color="$blue11" fontWeight="700">
                {formatProjectionValue(projectedPoints)} pts/g
              </Text>
            </XStack>
          )}
        </YStack>
      </Card.Footer>
    </Card>
  );
}

export { PlayerCard };
