import React from 'react';
import { H2, Text, YStack } from 'tamagui';

interface PlayerDetailProps {
  route: {
    params: {
      playerId: number;
    };
  };
}

const getPlayerDetails = (playerId: number) => {
  const playersData = [
    {
      battingAvg: 0.342,
      id: 1,
      name: 'Babe Ruth',
      position: 'OF',
      team: 'New York Yankees',
    },
    {
      battingAvg: 0.366,
      id: 2,
      name: 'Ty Cobb',
      position: 'CF',
      team: 'Detroit Tigers',
    },
  ];
  return playersData.find((player) => player.id === playerId);
};

const PlayerDetail: React.FC<PlayerDetailProps> = ({ route }) => {
  const { playerId } = route.params;
  const player = getPlayerDetails(playerId);

  if (!player) {
    return (
      <YStack padding="$4" backgroundColor="$background">
        <Text>Player not found</Text>
      </YStack>
    );
  }

  return (
    <YStack padding="$4" backgroundColor="$background" space="$3">
      <H2 fontSize="$8" fontWeight="bold" marginBottom="$3">
        {player.name}
      </H2>
      <Text fontSize="$4">Position: {player.position}</Text>
      <Text fontSize="$4">Team: {player.team}</Text>
      <Text fontSize="$4">Batting Average: {player.battingAvg}</Text>
    </YStack>
  );
};

export default PlayerDetail;
