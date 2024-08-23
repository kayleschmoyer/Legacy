import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from 'react-router-native';

const sports = [
  { name: 'Football', route: 'football-home' },
  { name: 'Baseball', route: 'baseball-home' },
];

export default function Home() {
  const navigation: any = useNavigation();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Fantasy Sports Hub</Text>
      <Text style={styles.subHeading}>Choose your sport</Text>
      <View style={styles.sportsContainer}>
        {sports.map((sport, index) => (
          <TouchableOpacity
            key={index}
            style={styles.sportCard}
            onPress={() => navigation.navigate(sport.route)}
          >

            <Text style={styles.sportName}>{sport.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 20,
  },
  heading: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  subHeading: {
    fontSize: 18,
    color: '#BBBBBB',
    marginBottom: 20,
  },
  sportsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
  },
  sportCard: {
    backgroundColor: '#292929',
    borderRadius: 12,
    width: '45%',
    marginBottom: 20,
    padding: 20,
    alignItems: 'center',
  },
  sportImage: {
    width: 100,
    height: 100,
    marginBottom: 10,
  },
  sportName: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
