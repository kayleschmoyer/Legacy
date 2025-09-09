import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

// Platform-agnostic styles
const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 20,
    ...(Platform.OS === 'web' && {
      minHeight: '60vh',
      display: 'flex' as any,
    }),
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3366FF',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  subtitle: {
    fontSize: 18,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  comingSoon: {
    fontSize: 16,
    color: '#8F9BB3',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
});

// Football-specific styles matching mobile app
const footballStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#121212',
    flexGrow: 1,
    padding: 20,
    ...(Platform.OS === 'web' && {
      minHeight: '60vh',
      display: 'flex' as any,
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
      display: 'flex' as any,
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

export function FootballScreen() {
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

export function BaseballScreen() {
  return (
    <View style={baseballStyles.container}>
      <Text style={baseballStyles.heading}>Baseball Fantasy</Text>
      <Text style={baseballStyles.subHeading}>Where Legends Are Made</Text>

      <Text style={baseballStyles.sectionTitle}>Manage Your Leagues</Text>
    </View>
  );
}
