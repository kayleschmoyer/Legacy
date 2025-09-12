import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function BaseballHome() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Baseball Fantasy</Text>
      <Text style={styles.subHeading}>Manage your leagues and drafts</Text>

      <Text style={styles.sectionTitle}>Upcoming Games</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bannerImage: {
    borderRadius: 10,
    height: 200,
    marginBottom: 20,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
    flexGrow: 1,
    padding: 20,
  },
  heading: {
    color: '#FF4500',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 10,
  },
  subHeading: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 20,
  },
});
