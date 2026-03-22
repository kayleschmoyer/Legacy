import React from 'react';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Player } from './PlayerCard';

interface StatsOverlayProps {
  onClose: () => void;
  player: Player | null;
}

export const StatsOverlay: React.FC<StatsOverlayProps> = ({
  onClose,
  player,
}) => {
  return (
    <YStack
      flex={1}
      padding="$4"
      backgroundColor="$background"
      borderRadius="$4"
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        <Text fontSize="$6" fontWeight="bold">
          {player?.name ? `${player.name} Stats` : 'Stats'}
        </Text>
        <Button size="$2" onPress={onClose}>
          <Text>X</Text>
        </Button>
      </XStack>
      <ScrollView>
        <Text>Stats data here...</Text>
      </ScrollView>
    </YStack>
  );
};
