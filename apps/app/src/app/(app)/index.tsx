import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

const sports = [
  { name: 'Football', route: 'Football' as const },
  { name: 'Baseball', route: 'Baseball' as const },
];

type RootStackParamList = {
  Home: undefined;
  Football: undefined;
  Baseball: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function Home() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Fantasy Sports Hub</Text>
      <Text style={styles.subHeading}>Choose your sport</Text>
      <View style={styles.sportsContainer}>
        {sports.map((sport, index) => (
          <TouchableOpacity
            key={sport.route}
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
