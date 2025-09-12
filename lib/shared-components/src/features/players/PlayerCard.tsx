import React from 'react';
import { Card, H4, Paragraph, XStack, YStack } from 'tamagui';
import { PlayerFragment } from './PlayersApi';

export interface PlayerCardProps {
  player: PlayerFragment;
  onPlayerClick?: (player: PlayerFragment) => void;
}

function PlayerCard({ player, onPlayerClick }: PlayerCardProps) {
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
        <XStack flex={1} jc="space-between" ai="center">
          <Paragraph theme="alt2" size={2}>
            ID: {player.id}
          </Paragraph>
          <Paragraph theme="alt2" size={2} fontFamily="$mono">
            {player.brefId}
          </Paragraph>
        </XStack>
      </Card.Footer>
    </Card>
  );
}

export { PlayerCard };
