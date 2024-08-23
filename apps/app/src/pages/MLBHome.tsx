import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';

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
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
    padding: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF4500',
    marginBottom: 10,
  },
  subHeading: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  bannerImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
});
