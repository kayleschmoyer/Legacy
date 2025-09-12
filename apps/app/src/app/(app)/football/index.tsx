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
  bannerImage: {
    borderRadius: 10,
    height: 200,
    marginBottom: 20,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#121212',
    flexGrow: 1,
    padding: 20,
  },
  heading: {
    color: '#FFD700',
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
