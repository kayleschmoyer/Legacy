import React from 'react';
import { Text, YStack } from 'tamagui';

interface Player {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg: number;
}

interface PlayerCardProps {
  player: Player;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ player }) => {
  return (
    <YStack
      backgroundColor="$gray1"
      borderRadius="$2"
      marginVertical="$3"
      padding="$4"
    >
      <Text fontSize="$5" fontWeight="bold" marginBottom="$2">
        {player.name}
      </Text>
      <Text marginBottom="$1">
        {player.position} - {player.team}
      </Text>
      <Text>Batting Average: {player.battingAvg}</Text>
    </YStack>
  );
};

export default PlayerCard;
