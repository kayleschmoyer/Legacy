import React from 'react';
import { Text, YStack } from 'tamagui';

interface LiveStreamProps {
  leagueId: string;
}

export const LiveStream: React.FC<LiveStreamProps> = ({
  leagueId: _leagueId,
}) => {
  return (
    <YStack padding="$4" backgroundColor="$background" borderRadius="$4">
      <Text fontSize="$6" fontWeight="bold">
        Live Stream
      </Text>
      <Text>Streaming draft...</Text>
    </YStack>
  );
};
