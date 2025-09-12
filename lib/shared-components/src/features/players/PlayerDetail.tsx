import React from 'react';
import { StyleSheet, Text, View, ScrollView } from '../../platform-components';

// Generic player detail interface
export interface PlayerDetailData {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  hits?: number;
  strikeouts?: number;
  walks?: number;
  obp?: number;
  slg?: number;
  era?: number;
  wins?: number;
  losses?: number;
  saves?: number;
  // Add more stats as needed
}

export interface PlayerDetailProps {
  player?: PlayerDetailData;
  loading?: boolean;
  error?: string;
  onPlayerSelect?: (playerId: number) => void;
}

// Mock player data for fallback
const getPlayerDetails = (playerId: number): PlayerDetailData | undefined => {
  const playersData: PlayerDetailData[] = [
    {
      battingAvg: 0.342,
      homeRuns: 714,
      id: 1,
      name: 'Babe Ruth',
      position: 'OF',
      rbi: 2213,
      runs: 2174,
      team: 'New York Yankees',
    },
    {
      battingAvg: 0.366,
      homeRuns: 117,
      id: 2,
      name: 'Ty Cobb',
      position: 'CF',
      rbi: 1944,
      runs: 2246,
      team: 'Detroit Tigers',
    },
  ];
  return playersData.find((player) => player.id === playerId);
};

function PlayerDetail({ player, loading, error }: PlayerDetailProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading player details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Player not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{player.name}</Text>
        <Text style={styles.position}>{player.position}</Text>
        <Text style={styles.team}>{player.team}</Text>
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Batting Statistics</Text>

        {player.battingAvg !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Batting Average:</Text>
            <Text style={styles.statValue}>{player.battingAvg.toFixed(3)}</Text>
          </View>
        )}

        {player.homeRuns !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Home Runs:</Text>
            <Text style={styles.statValue}>{player.homeRuns}</Text>
          </View>
        )}

        {player.rbi !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>RBIs:</Text>
            <Text style={styles.statValue}>{player.rbi}</Text>
          </View>
        )}

        {player.runs !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Runs:</Text>
            <Text style={styles.statValue}>{player.runs}</Text>
          </View>
        )}

        {player.hits !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Hits:</Text>
            <Text style={styles.statValue}>{player.hits}</Text>
          </View>
        )}

        {player.obp !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>On-Base Percentage:</Text>
            <Text style={styles.statValue}>{player.obp.toFixed(3)}</Text>
          </View>
        )}

        {player.slg !== undefined && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Slugging Percentage:</Text>
            <Text style={styles.statValue}>{player.slg.toFixed(3)}</Text>
          </View>
        )}

        {/* Pitching Stats */}
        {(player.era !== undefined || player.wins !== undefined) && (
          <>
            <Text style={styles.sectionTitle}>Pitching Statistics</Text>

            {player.era !== undefined && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>ERA:</Text>
                <Text style={styles.statValue}>{player.era.toFixed(2)}</Text>
              </View>
            )}

            {player.wins !== undefined && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Wins:</Text>
                <Text style={styles.statValue}>{player.wins}</Text>
              </View>
            )}

            {player.losses !== undefined && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Losses:</Text>
                <Text style={styles.statValue}>{player.losses}</Text>
              </View>
            )}

            {player.saves !== undefined && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Saves:</Text>
                <Text style={styles.statValue}>{player.saves}</Text>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// Component that takes a player ID and fetches data
export interface PlayerDetailByIdProps {
  playerId: number;
}

function PlayerDetailById({ playerId }: PlayerDetailByIdProps) {
  const player = getPlayerDetails(playerId);

  return <PlayerDetail player={player} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 5,
  },
  position: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 5,
  },
  team: {
    fontSize: 16,
    color: '#CCCCCC',
  },
  statsContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 15,
    marginTop: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  statValue: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
  },
});

export { PlayerDetail };
export { PlayerDetailById };
