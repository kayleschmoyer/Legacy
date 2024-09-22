import React, { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { gql, useQuery } from '@apollo/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get device dimensions
const { width } = Dimensions.get('window');

// Define GraphQL queries for player stats
const GET_CAREER_BATTING_STATS = gql`
  query GetCareerBattingStats {
    players {
      id
      name
      rank
      team
      position
      avg
      homeRuns
      rbi
      runs
      stolenBases
      obp
      slg
      ops
    }
  }
`;

const GET_CAREER_PITCHING_STATS = gql`
  query GetCareerPitchingStats {
    players {
      id
      name
      rank
      team
      position
      wins
      losses
      era
      strikeouts
      whip
    }
  }
`;

export type Player = {
  id: number;
  rank: number;
  name: string;
  position: string;
  team: string;
  avg?: string;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  stolenBases?: number;
  obp?: string;
  slg?: string;
  ops?: string;
  wins?: number;
  losses?: number;
  era?: string;
  strikeouts?: number;
  whip?: string;
};

const DraftBoardPage = () => {
  const { data: battingStats, loading: loadingBatting, error: errorBatting } = useQuery(GET_CAREER_BATTING_STATS);
  const { data: pitchingStats, loading: loadingPitching, error: errorPitching } = useQuery(GET_CAREER_PITCHING_STATS);

  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const playersList = [...(battingStats?.players || []), ...(pitchingStats?.players || [])];

  const filteredPlayers = playersList.filter((player) => {
    const matchesTeam = selectedTeam ? player.team === selectedTeam : true;
    const matchesSearch = player.name.toLowerCase().includes(searchText.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  const storeDraftHistory = async (draftPick: Player) => {
    // Store draft pick in AsyncStorage
    try {
      const draftHistoryString = await AsyncStorage.getItem('draftHistory');
      let draftHistory = draftHistoryString ? JSON.parse(draftHistoryString) : [];
      draftHistory.push(draftPick);
      await AsyncStorage.setItem('draftHistory', JSON.stringify(draftHistory));
    } catch (error) {
      console.error('Failed to save draft history', error);
    }
  };

  return (
    <ScrollView>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search Player"
          value={searchText}
          onChangeText={setSearchText}
        />
        <Picker
          selectedValue={selectedTeam ?? undefined}
          style={styles.teamSelector}
          onValueChange={(itemValue: string) => setSelectedTeam(itemValue)}
        >
          <Picker.Item label="All Teams" value={undefined} />
          <Picker.Item label="Yankees" value="NYY" />
          <Picker.Item label="Tigers" value="DET" />
        </Picker>
      </View>

      <View style={styles.tableContainer}>
        {/* Table Headers */}
        <View style={styles.tableRow}>
          <Text style={styles.tableHeader}>Rank</Text>
          <Text style={styles.tableHeader}>Name</Text>
          <Text style={styles.tableHeader}>Position</Text>
          <Text style={styles.tableHeader}>Team</Text>
          <Text style={styles.tableHeader}>Stat</Text>
        </View>

        {/* Player List */}
        <FlatList
          data={filteredPlayers}
          ListEmptyComponent={<Text style={styles.noData}>No Data Available</Text>} // Show "No Data" if empty
          renderItem={({ item }) => (
            <View style={styles.tableRow}>
              <Text style={styles.tableData}>{item.rank}</Text>
              <Text style={styles.tableData}>{item.name}</Text>
              <Text style={styles.tableData}>{item.position}</Text>
              <Text style={styles.tableData}>{item.team}</Text>
              {item.avg ? (
                <Text style={styles.tableData}>{item.avg}</Text>
              ) : item.era ? (
                <Text style={styles.tableData}>{item.era}</Text>
              ) : (
                <Text style={styles.tableData}>N/A</Text>
              )}
            </View>
          )}
          keyExtractor={(item) => item.id.toString()}
        />
      </View>

      <TouchableOpacity
        style={styles.saveDraftButton}
        onPress={() => storeDraftHistory(filteredPlayers[0])} // Save the first player for now
      >
        <Text style={styles.saveDraftText}>Save Draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    padding: 10,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderRadius: 25,
    borderWidth: 1,
    fontSize: 16,
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  teamSelector: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 10,
  },
  tableContainer: {
    marginTop: 20,
    marginHorizontal: 10,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tableHeader: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  tableData: {
    fontSize: 14,
  },
  noData: {
    textAlign: 'center',
    marginVertical: 20,
    color: 'red',
  },
  saveDraftButton: {
    backgroundColor: '#28a745',
    borderRadius: 10,
    marginBottom: 16,
    padding: 16,
  },
  saveDraftText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default DraftBoardPage;
