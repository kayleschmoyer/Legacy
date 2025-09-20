import React from 'react';
import { Platform, StyleSheet, Text, View } from '../platform-components';

// Football-specific styles matching mobile app
const footballStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#121212',
    flexGrow: 1,
    padding: 20,
    ...(Platform.OS === 'web' && {
      minHeight: '60vh',
      display: 'flex' as const,
    }),
  },
  heading: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  subHeading: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
});

// Baseball-specific styles matching mobile app
const baseballStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#121212',
    flexGrow: 1,
    padding: 20,
    ...(Platform.OS === 'web' && {
      minHeight: '60vh',
      display: 'flex' as const,
    }),
  },
  heading: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  subHeading: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
});

function FootballScreen() {
  return (
    <View style={footballStyles.container}>
      <Text style={footballStyles.heading}>Football Fantasy</Text>
      <Text style={footballStyles.subHeading}>
        Manage your leagues and drafts
      </Text>

      <Text style={footballStyles.sectionTitle}>Upcoming Drafts</Text>
    </View>
  );
}

function BaseballScreen() {
  return (
    <View style={baseballStyles.container}>
      <Text style={baseballStyles.heading}>Baseball Fantasy</Text>
      <Text style={baseballStyles.subHeading}>Where Legends Are Made</Text>

      <Text style={baseballStyles.sectionTitle}>Manage Your Leagues</Text>
    </View>
  );
}

export { FootballScreen };
export { BaseballScreen };
