import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
      <View style={styles.container}>
        <Text>Player not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{player.name}</Text>
      <Text>Position: {player.position}</Text>
      <Text>Team: {player.team}</Text>
      <Text>Batting Average: {player.battingAvg}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 20,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

export default PlayerDetail;
