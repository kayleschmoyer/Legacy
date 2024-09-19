import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';

const sports = [
  { name: 'Football', route: 'football' },
  { name: 'Baseball', route: 'baseball' },
];

export default function Home() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Fantasy Sports Hub</Text>
      <Text style={styles.subHeading}>Choose your sport</Text>
      <View style={styles.sportsContainer}>
        {sports.map((sport, index) => (
          <Link href={sport.route} asChild key={sport.route}>
            <TouchableOpacity style={styles.sportCard}>
              <Text style={styles.sportName}>{sport.name}</Text>
            </TouchableOpacity>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  sportCard: {
    alignItems: 'center',
    backgroundColor: '#292929',
    borderRadius: 12,
    marginBottom: 20,
    padding: 20,
    width: '45%',
  },
  sportImage: {
    height: 100,
    marginBottom: 10,
    width: 100,
  },
  sportName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  sportsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
  },
  subHeading: {
    color: '#BBBBBB',
    fontSize: 18,
    marginBottom: 20,
  },
});
