import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
    <View style={styles.card}>
      <Text style={styles.name}>{player.name}</Text>
      <Text>{player.position} - {player.team}</Text>
      <Text>Batting Average: {player.battingAvg}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 15,
    marginVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PlayerCard;
