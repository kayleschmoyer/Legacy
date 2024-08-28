import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';

const sports = [
  { name: 'Football', route: '/football' },
  { name: 'Baseball', route: '/baseball' },
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
