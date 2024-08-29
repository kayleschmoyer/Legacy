import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function FootballHome() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Football Fantasy</Text>
      <Text style={styles.subHeading}>Manage your leagues and drafts</Text>

      <Text style={styles.sectionTitle}>Upcoming Drafts</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
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
