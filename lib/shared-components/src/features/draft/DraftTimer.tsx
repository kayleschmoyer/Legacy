import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

interface DraftTimerProps {
  sport: string;
  currentPick: number;
  speed?: number;
  onSpeedChange?: (speed: number) => void;
}

export const DraftTimer: React.FC<DraftTimerProps> = ({ sport, currentPick, speed = 30, onSpeedChange }) => {
  return (
    <YStack alignItems="center" padding="$4" backgroundColor="$backgroundHover" borderRadius="$4">
      <Text fontSize="$6" fontWeight="bold">Draft Timer</Text>
      <Text fontSize="$4">Pick #{currentPick}</Text>
      <XStack space="$2" alignItems="center">
        <Button size="$3" onPress={() => onSpeedChange?.(speed - 5)}>-</Button>
        <Text>{speed}s</Text>
        <Button size="$3" onPress={() => onSpeedChange?.(speed + 5)}>+</Button>
      </XStack>
    </YStack>
  );
};
