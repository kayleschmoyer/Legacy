import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PlayerDetailProps {
  route: {
    params: {
      playerId: number;
    };
  };
}

const getPlayerDetails = (playerId: number) => {
  const playersData = [
    { id: 1, name: 'Babe Ruth', position: 'OF', team: 'New York Yankees', battingAvg: 0.342 },
    { id: 2, name: 'Ty Cobb', position: 'CF', team: 'Detroit Tigers', battingAvg: 0.366 },
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
    padding: 20,
    backgroundColor: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

export default PlayerDetail;
